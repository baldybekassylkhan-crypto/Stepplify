with open('script.js', 'r', encoding='utf-8', errors='ignore') as f:
    js = f.read()

# Remove old openTermsModal block
marker = '/* ============================================================\n   Terms of Use Modal'
if marker in js:
    js = js[:js.find(marker)].rstrip() + '\n'

# Append correct version using classList.add('open') pattern
terms_js = '''

/* ============================================================
   Terms of Use Modal
   ============================================================ */
window.openTermsModal = function() {
  var overlay = document.getElementById('termsOverlay');
  if (!overlay) { console.warn('termsOverlay not found'); return; }
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  var closeBtn  = document.getElementById('termsClose');
  var acceptBtn = document.getElementById('termsAcceptBtn');

  function closeTerms() {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function acceptTerms() {
    var check = document.getElementById('publishTermsCheck');
    if (check) {
      check.checked = true;
      check.dispatchEvent(new Event('change'));
    }
    closeTerms();
  }

  if (closeBtn)  closeBtn.onclick  = closeTerms;
  if (acceptBtn) acceptBtn.onclick = acceptTerms;

  overlay.onclick = function(e) {
    if (e.target === overlay) closeTerms();
  };

  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') {
      closeTerms();
      document.removeEventListener('keydown', escHandler);
    }
  });
};
'''

js = js + terms_js

with open('script.js', 'w', encoding='utf-8', newline='\n') as f:
    f.write(js)

# Also fix the termsOverlay: remove style="display:none" so CSS class 'open' works
for filename in ['index.html', 'catalog.html']:
    with open(filename, 'r', encoding='utf-8') as f:
        html = f.read()
    # Remove inline display:none and z-index from termsOverlay
    html = html.replace(
        'id="termsOverlay" aria-hidden="true" style="display:none; z-index:10001;"',
        'id="termsOverlay" aria-hidden="true"'
    )
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'Fixed {filename}')

print('script.js updated')
