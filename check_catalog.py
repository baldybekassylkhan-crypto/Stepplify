import re
with open('catalog.html', 'r', encoding='utf-8') as f:
    html = f.read()

idx = html.find('publishSubmitBtn')
print('Found in catalog.html at idx:', idx)

scripts = re.findall(r'<script[^>]*src="([^"]+)"', html)
print('Scripts:', scripts)
