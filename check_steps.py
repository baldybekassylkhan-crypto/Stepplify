import re
with open('index.html', encoding='utf-8') as f:
    html = f.read()
matches = re.findall(r'<div class="about-route-point">.*?</div>\s*</div>', html, re.DOTALL)
for i, m in enumerate(matches):
    print(f'--- Step {i+1} ---')
    print(m.encode('utf-8').decode('cp1251', errors='ignore')) # just to see something
