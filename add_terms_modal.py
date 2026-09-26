import re

terms_modal = """
<!-- ============ Terms of Use Modal ============ -->
<div class="auth-overlay" id="termsOverlay" aria-hidden="true" style="display:none; z-index:10001;">
  <div class="auth-modal" style="max-width:640px; max-height:80vh; overflow-y:auto;" role="dialog" aria-modal="true" aria-labelledby="termsModalTitle">
    <button class="auth-close" id="termsClose" aria-label="Закрыть">&times;</button>
    <h2 class="modal-title" id="termsModalTitle" style="margin-bottom:1.4rem;">Условия публикации</h2>

    <div style="font-size:0.88rem; line-height:1.7; color:rgba(255,255,255,0.75);">

      <h3 style="font-size:1rem; color:#fff; margin:1.2rem 0 0.5rem;">1. Оригинальность материала</h3>
      <p>Публикуя статью, вы подтверждаете, что материал является вашим оригинальным произведением. Плагиат, копирование текстов из других источников без указания авторства и разрешения правообладателя строго запрещены. Stepplify оставляет за собой право удалить любой материал, нарушающий авторские права.</p>

      <h3 style="font-size:1rem; color:#fff; margin:1.2rem 0 0.5rem;">2. Лицензия на использование</h3>
      <p>Размещая статью на платформе, вы предоставляете Stepplify неисключительную, безвозмездную лицензию на хранение, отображение, продвижение и использование вашего материала в рамках деятельности платформы — в том числе в образовательных, информационных и маркетинговых целях. Авторство при этом всегда сохраняется за вами.</p>

      <h3 style="font-size:1rem; color:#fff; margin:1.2rem 0 0.5rem;">3. Достоверность информации</h3>
      <p>Вы несёте ответственность за точность и достоверность опубликованных фактов. Сведения о природных объектах, маршрутах и локациях должны соответствовать действительности. Намеренное распространение ложной или вводящей в заблуждение информации недопустимо.</p>

      <h3 style="font-size:1rem; color:#fff; margin:1.2rem 0 0.5rem;">4. Запрещённый контент</h3>
      <p>Запрещается публиковать материалы, содержащие: оскорбления и дискриминацию по любому признаку; призывы к насилию; рекламу товаров и услуг; контент, нарушающий законодательство Республики Казахстан; материалы, не связанные с природой, туризмом или культурой Казахстана.</p>

      <h3 style="font-size:1rem; color:#fff; margin:1.2rem 0 0.5rem;">5. Фотографии и медиа</h3>
      <p>Прикрепляя фотографии, вы подтверждаете, что являетесь их автором или имеете право на их публикацию. Использование чужих снимков без разрешения автора запрещено.</p>

      <h3 style="font-size:1rem; color:#fff; margin:1.2rem 0 0.5rem;">6. Модерация</h3>
      <p>Все публикации проходят проверку модераторов платформы. Stepplify вправе отклонить, скрыть или удалить материал, не соответствующий данным условиям, без предварительного уведомления автора.</p>

      <h3 style="font-size:1rem; color:#fff; margin:1.2rem 0 0.5rem;">7. Изменение условий</h3>
      <p>Stepplify вправе обновлять настоящие условия. Продолжая пользоваться платформой, вы соглашаетесь с актуальной редакцией условий.</p>

      <p style="margin-top:1.5rem; color:rgba(255,255,255,0.45); font-size:0.78rem;">Последнее обновление: сентябрь 2026 г.</p>
    </div>

    <button class="auth-submit" id="termsAcceptBtn" style="margin-top:1.5rem; width:100%;">Понятно, принимаю условия</button>
  </div>
</div>
"""

for filename in ['index.html', 'catalog.html']:
    with open(filename, 'r', encoding='utf-8') as f:
        html = f.read()

    # Update the onclick on the terms links to open modal
    html = html.replace(
        'class="publish-terms-link" onclick="return false;">условиями использования</a>',
        'class="publish-terms-link" id="termsOpenLink" onclick="openTermsModal();return false;">условиями использования</a>'
    )
    html = html.replace(
        'class="publish-terms-link" onclick="return false;">политикой публикации</a>',
        'class="publish-terms-link" onclick="openTermsModal();return false;">политикой публикации</a>'
    )

    # Insert the modal before </body>
    if 'termsOverlay' not in html:
        html = html.replace('</body>', terms_modal + '\n</body>')

    with open(filename, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'Updated {filename}')
