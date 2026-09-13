// ============================================================
// Report System (Frontend)
// ============================================================
const reportModalsHTML = `
<!-- Report Modal -->
<div class="auth-overlay" id="reportOverlay" aria-hidden="true" style="display:none; align-items:center; justify-content:center; position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.7); backdrop-filter:blur(4px);">
  <div class="auth-modal" role="dialog" aria-modal="true" aria-label="Пожаловаться" style="background:#161b26; padding:24px; border-radius:16px; width:400px; max-width:90%; position:relative; border:1px solid rgba(255,255,255,0.1);">
    <button class="auth-close" id="reportClose" aria-label="Закрыть" style="position:absolute; top:16px; right:16px; background:none; border:none; color:rgba(255,255,255,0.5); font-size:24px; cursor:pointer;">&times;</button>
    <h2 class="modal-title" style="margin-bottom:16px; color:#fff; font-size:1.2rem;">Пожаловаться</h2>
    <form id="reportForm">
      <input type="hidden" id="reportTargetType" name="targetType">
      <input type="hidden" id="reportTargetId" name="targetId">
      <div class="auth-field" style="margin-bottom:16px;">
        <label for="reportReason" style="display:block; margin-bottom:8px; color:rgba(255,255,255,0.7); font-size:0.9rem;">Причина жалобы</label>
        <select id="reportReason" name="reason" required style="width:100%; padding:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#fff;">
          <option value="spam">Спам или реклама</option>
          <option value="inaccurate">Недостоверная информация</option>
          <option value="offensive">Оскорбления / Недопустимый контент</option>
          <option value="other">Другое</option>
        </select>
      </div>
      <button type="submit" class="auth-submit btn btn-primary" style="width:100%; padding:12px; background:var(--accent); color:#fff; border:none; border-radius:8px; cursor:pointer;">Отправить жалобу</button>
    </form>
  </div>
</div>

<!-- Admin Reports Modal -->
<div class="auth-overlay" id="adminReportsOverlay" aria-hidden="true" style="display:none; align-items:center; justify-content:center; position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.7); backdrop-filter:blur(4px);">
  <div class="auth-modal" role="dialog" aria-modal="true" aria-label="Панель жалоб" style="background:#161b26; padding:24px; border-radius:16px; width:600px; max-width:90%; max-height:80vh; display:flex; flex-direction:column; position:relative; border:1px solid rgba(255,255,255,0.1);">
    <button class="auth-close" id="adminReportsClose" aria-label="Закрыть" style="position:absolute; top:16px; right:16px; background:none; border:none; color:rgba(255,255,255,0.5); font-size:24px; cursor:pointer;">&times;</button>
    <h2 class="modal-title" style="margin-bottom:16px; color:#fff; font-size:1.2rem;">Жалобы (Модерация)</h2>
    <div id="adminReportsList" style="display:flex; flex-direction:column; gap:12px; overflow-y:auto; padding-right:8px;"></div>
  </div>
</div>
`;

if (document.body) {
  document.body.insertAdjacentHTML('beforeend', reportModalsHTML);
  bindReportEvents();
} else {
  document.addEventListener('DOMContentLoaded', () => {
    document.body.insertAdjacentHTML('beforeend', reportModalsHTML);
    bindReportEvents();
  });
}

function bindReportEvents() {
  document.getElementById('reportClose').addEventListener('click', () => {
    document.getElementById('reportOverlay').style.display = 'none';
  });

  document.getElementById('reportForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('stepplify_token');
    const type = document.getElementById('reportTargetType').value;
    const id = document.getElementById('reportTargetId').value;
    const reason = document.getElementById('reportReason').value;
    
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ targetType: type, targetId: id, reason })
      });
      if (res.ok) {
        alert('Ваша жалоба успешно отправлена. Спасибо!');
        document.getElementById('reportOverlay').style.display = 'none';
        document.getElementById('reportForm').reset();
      } else {
        alert('Ошибка отправки жалобы');
      }
    } catch (e) {
      console.error(e);
      alert('Ошибка сети');
    }
  });

  document.getElementById('adminReportsClose').addEventListener('click', () => {
    document.getElementById('adminReportsOverlay').style.display = 'none';
  });
}

window.openReportModal = (type, id) => {
  const token = localStorage.getItem('stepplify_token');
  if (!token) {
    alert('Пожалуйста, войдите в систему, чтобы отправить жалобу.');
    return;
  }
  const overlay = document.getElementById('reportOverlay');
  if (!overlay) {
    alert('Модальное окно еще не загружено, попробуйте еще раз.');
    return;
  }
  document.getElementById('reportTargetType').value = type;
  document.getElementById('reportTargetId').value = id;
  overlay.style.display = 'flex';
};

window.openAdminReportsModal = async () => {
  const token = localStorage.getItem('stepplify_token');
  const overlay = document.getElementById('adminReportsOverlay');
  if (!overlay) {
    alert('Модальное окно еще не загружено, попробуйте еще раз.');
    return;
  }
  overlay.style.display = 'flex';
  const list = document.getElementById('adminReportsList');
  list.innerHTML = 'Загрузка...';

  try {
    const res = await fetch('/api/reports', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to load');
    const reports = await res.json();
    
    if (reports.length === 0) {
      list.innerHTML = '<div style="color:rgba(255,255,255,0.5);">Нет активных жалоб.</div>';
      return;
    }

    list.innerHTML = reports.map(r => `
      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:12px; border-radius:8px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <strong style="color:#fff;">ID: ${r.id} | Тип: ${r.targetType} (${r.targetId})</strong>
          <span style="color:${r.status === 'pending' ? 'var(--accent)' : 'gray'};">${r.status}</span>
        </div>
        <div style="color:rgba(255,255,255,0.7); font-size:0.9rem; margin-bottom:8px;">
          От: ${r.user.fullName} (${r.user.email})<br>
          Причина: ${r.reason}
        </div>
        ${r.status === 'pending' ? `
          <div style="display:flex; gap:8px; margin-top:8px;">
            <button onclick="resolveReport(${r.id}, 'resolved')" style="padding:6px 12px; background:#2e7d32; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:0.8rem;">Подтвердить</button>
            <button onclick="resolveReport(${r.id}, 'dismissed')" style="padding:6px 12px; background:#555; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:0.8rem;">Отклонить</button>
          </div>
        ` : ''}
      </div>
    `).join('');
  } catch (e) {
    console.error(e);
    list.innerHTML = '<div style="color:var(--accent);">Ошибка загрузки жалоб. Вы точно модератор?</div>';
  }
};

window.resolveReport = async (id, status) => {
  const token = localStorage.getItem('stepplify_token');
  try {
    const res = await fetch(`/api/reports/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ status })
    });
    if (res.ok) {
      window.openAdminReportsModal(); // refresh list
    }
  } catch (e) {
    console.error(e);
    alert('Ошибка при обновлении статуса');
  }
};
