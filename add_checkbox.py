import re

checkbox_html = """      <label class="publish-terms-row" for="publishTermsCheck">
        <input type="checkbox" id="publishTermsCheck" />
        <span>Я согласен с <a href="#" class="publish-terms-link" onclick="return false;">условиями использования</a> и <a href="#" class="publish-terms-link" onclick="return false;">политикой публикации</a> сайта</span>
      </label>
"""

old_block = '      <div class="publish-ai-row">'
new_block = checkbox_html + '      <div class="publish-ai-row">'

for filename in ['index.html', 'catalog.html']:
    with open(filename, 'r', encoding='utf-8') as f:
        html = f.read()
    if old_block in html:
        html = html.replace(old_block, new_block, 1)
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(html)
        print(f"Updated {filename}")
    else:
        print(f"WARNING: pattern not found in {filename}")
