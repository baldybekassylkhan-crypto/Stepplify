import re
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Define the new step 01
svg_bulb = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6A4.997 4.997 0 0 1 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z" /></svg>'

new_step = f"""<div class="about-route-point">
          <span class="arp-dot">{svg_bulb}</span>
          <div class="arp-card">
            <span class="arp-label">ШАГ 01</span>
            <h4>Вдохновляйся</h4>
            <p>Изучай красоту природы и читай уникальные истории о родном крае.</p>
          </div>
        </div>
        """

# We need to find where the first about-route-point starts.
# Replace <span class="arp-label">Шаг 01</span> with 02, 02 with 03, 03 with 04
html = html.replace('ШАГ 03', 'ШАГ 04').replace('ШАГ 02', 'ШАГ 03').replace('ШАГ 01', 'ШАГ 02')
html = html.replace('Шаг 03', 'Шаг 04').replace('Шаг 02', 'Шаг 03').replace('Шаг 01', 'Шаг 02')

# Now insert the new step right before the first about-route-point
start_idx = html.find('<div class="about-route-point">')
if start_idx != -1:
    html = html[:start_idx] + new_step + html[start_idx:]

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("Done")
