import prisma from '../db.js';

// Fields safe to hand back for another user's card (search results,
// friends list, incoming/outgoing requests) — never email/passwordHash.
const PUBLIC_USER_SELECT = {
  id: true,
  fullName: true,
  avatarUrl: true,
  school: true,
  grade: true,
  points: true,
  level: true,
};

// Shared by SearchUsers/ListFriends so a card can say "уже друзья" /
// "заявка отправлена" / "хочет добавить вас" instead of just a name.
// friendshipId is only meaningful (and only returned) for
// pending_incoming — that's the one status the frontend needs it for,
// to accept/decline straight from a search result.
const friendStatusBetween = async (meId, otherId) => {
  if (meId === otherId) return { status: 'self', friendshipId: null };
  const row = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: meId, addresseeId: otherId },
        { requesterId: otherId, addresseeId: meId },
      ],
    },
  });
  if (!row) return { status: 'none', friendshipId: null };
  if (row.status === 'accepted') return { status: 'friends', friendshipId: null };
  return row.requesterId === meId
    ? { status: 'pending_outgoing', friendshipId: null }
    : { status: 'pending_incoming', friendshipId: row.id };
};

// 1. SearchUsers — by name or school, for the "Найти друзей" tab.
// Filtered in JS rather than a SQL `contains` — SQLite's LIKE only
// case-folds ASCII by default, so a Cyrillic query like "айгерим"
// wouldn't match a stored "Айгерим" via the database itself. The user
// table is small enough (school platform, not a social network at
// scale) that fetching and filtering in-process is the simple, correct
// option rather than adding a collation extension for this.
export const searchUsers = async (req, res) => {
  try {
    const q = (req.query.q || '').trim().toLowerCase();
    if (q.length < 2) {
      return res.json([]);
    }

    const allUsers = await prisma.user.findMany({
      where: { id: { not: req.user.id } },
      select: PUBLIC_USER_SELECT,
    });

    const matches = allUsers
      .filter((u) => u.fullName.toLowerCase().includes(q) || (u.school || '').toLowerCase().includes(q))
      .slice(0, 20);

    const withStatus = await Promise.all(
      matches.map(async (u) => {
        const { status, friendshipId } = await friendStatusBetween(req.user.id, u.id);
        return { ...u, friendStatus: status, friendshipId };
      })
    );

    return res.json(withStatus);
  } catch (error) {
    console.error('Error in SearchUsers:', error);
    return res.status(500).json({ error: 'Ошибка при поиске пользователей.' });
  }
};

// 2. SendFriendRequest
export const sendFriendRequest = async (req, res) => {
  try {
    const addresseeId = parseInt(req.params.userId);
    if (isNaN(addresseeId)) {
      return res.status(400).json({ error: 'Некорректный ID пользователя.' });
    }
    if (addresseeId === req.user.id) {
      return res.status(400).json({ error: 'Нельзя добавить в друзья самого себя.' });
    }

    const addressee = await prisma.user.findUnique({ where: { id: addresseeId }, select: { id: true } });
    if (!addressee) {
      return res.status(404).json({ error: 'Пользователь не найден.' });
    }

    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: req.user.id, addresseeId },
          { requesterId: addresseeId, addresseeId: req.user.id },
        ],
      },
    });
    if (existing) {
      return res.status(400).json({ error: 'Заявка уже отправлена или вы уже друзья.' });
    }

    const friendship = await prisma.friendship.create({
      data: { requesterId: req.user.id, addresseeId, status: 'pending' },
    });

    return res.status(201).json({ message: 'Заявка в друзья отправлена.', friendshipId: friendship.id });
  } catch (error) {
    console.error('Error in SendFriendRequest:', error);
    return res.status(500).json({ error: 'Ошибка при отправке заявки.' });
  }
};

// 3. RespondToFriendRequest — only the addressee may accept/decline an
// incoming request. `accept: false` behaves the same as removeFriendship
// below (deletes the row) but is exposed separately for a clearer intent
// at the call site (declining vs. unfriending an existing friend).
export const respondToFriendRequest = async (req, res) => {
  try {
    const friendshipId = parseInt(req.params.friendshipId);
    const accept = !!req.body.accept;
    if (isNaN(friendshipId)) {
      return res.status(400).json({ error: 'Некорректный ID заявки.' });
    }

    const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) {
      return res.status(404).json({ error: 'Заявка не найдена.' });
    }
    if (friendship.addresseeId !== req.user.id) {
      return res.status(403).json({ error: 'Только получатель заявки может её принять или отклонить.' });
    }

    if (!accept) {
      await prisma.friendship.delete({ where: { id: friendshipId } });
      return res.json({ message: 'Заявка отклонена.' });
    }

    await prisma.friendship.update({ where: { id: friendshipId }, data: { status: 'accepted' } });
    return res.json({ message: 'Заявка принята — теперь вы друзья.' });
  } catch (error) {
    console.error('Error in RespondToFriendRequest:', error);
    return res.status(500).json({ error: 'Ошибка при обработке заявки.' });
  }
};

// 4. RemoveFriendship — unfriend an accepted friend, or cancel an
// outgoing request you sent. Either side of the row may remove it.
export const removeFriendship = async (req, res) => {
  try {
    const otherUserId = parseInt(req.params.userId);
    if (isNaN(otherUserId)) {
      return res.status(400).json({ error: 'Некорректный ID пользователя.' });
    }

    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: req.user.id, addresseeId: otherUserId },
          { requesterId: otherUserId, addresseeId: req.user.id },
        ],
      },
    });
    if (!friendship) {
      return res.status(404).json({ error: 'Связь не найдена.' });
    }

    await prisma.friendship.delete({ where: { id: friendship.id } });
    return res.json({ message: 'Готово.' });
  } catch (error) {
    console.error('Error in RemoveFriendship:', error);
    return res.status(500).json({ error: 'Ошибка при удалении из друзей.' });
  }
};

// 5. ListFriends — accepted friends + incoming/outgoing pending requests
// for the profile modal's "Друзья" tab.
export const listFriends = async (req, res) => {
  try {
    const rows = await prisma.friendship.findMany({
      where: {
        OR: [{ requesterId: req.user.id }, { addresseeId: req.user.id }],
      },
      include: {
        requester: { select: PUBLIC_USER_SELECT },
        addressee: { select: PUBLIC_USER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    });

    const friends = [];
    const incoming = [];
    const outgoing = [];

    for (const row of rows) {
      const isMeRequester = row.requesterId === req.user.id;
      const other = isMeRequester ? row.addressee : row.requester;
      if (row.status === 'accepted') {
        friends.push(other);
      } else if (isMeRequester) {
        outgoing.push(other);
      } else {
        incoming.push({ ...other, friendshipId: row.id });
      }
    }

    return res.json({ friends, incoming, outgoing });
  } catch (error) {
    console.error('Error in ListFriends:', error);
    return res.status(500).json({ error: 'Ошибка при получении списка друзей.' });
  }
};
