import re
with open('index.html', encoding='utf-8') as f:
    html = f.read()

dots = re.findall(r'<span class="arp-dot">.*?</span>', html, flags=re.DOTALL)
for d in dots:
    print(d.encode('unicode_escape').decode('ascii'))
