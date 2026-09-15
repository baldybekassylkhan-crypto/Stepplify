import re
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

svg1 = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>'
svg2 = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.46 7.42l-2.6 7.8c-.08.25-.27.44-.52.52l-7.8 2.6c-.41.14-.8-.25-.66-.66l2.6-7.8c.08-.25.27-.44.52-.52l7.8-2.6c.41-.14.8.25.66.66zM12 10.9c-.61 0-1.1.49-1.1 1.1s.49 1.1 1.1 1.1 1.1-.49 1.1-1.1-.49-1.1-1.1-1.1z" /></svg>'
svg3 = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0 0 11 15.9V19H7v2h10v-2h-4v-3.1a5.01 5.01 0 0 0 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z" /></svg>'

replacements = [
    f'<span class="arp-dot">{svg1}</span>',
    f'<span class="arp-dot">{svg2}</span>',
    f'<span class="arp-dot">{svg3}</span>'
]

def repl(match):
    return replacements.pop(0) if replacements else match.group(0)

html = re.sub(r'<span class="arp-dot">.*?</span>', repl, html, flags=re.DOTALL)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("Done")
