import jwt from 'jsonwebtoken';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : req.query.token;

  if (!token) {
    return res.status(401).json({ error: 'Доступ запрещен. Токен не предоставлен.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'stepplify_secret_jwt_key_2026');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Недействительный или истекший токен.' });
  }
};

// Like authenticateToken, but for routes that work for both guests and
// logged-in users (e.g. reading an article) — decodes the token when
// present and valid, otherwise just continues with req.user left unset
// instead of rejecting the request.
export const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : req.query.token;

  if (!token) return next();

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'stepplify_secret_jwt_key_2026');
  } catch {
    // Invalid/expired token on an optional route — treat as a guest
    // rather than failing the request.
  }
  next();
};
