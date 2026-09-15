import re
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# The user wants to remove "Открывай" which is currently Step 03
# And rename "Выигрывай" (currently Step 04) to Step 03.

# Let's extract all the steps
matches = re.findall(r'<div class="about-route-point">.*?</div>\s*</div>', html, re.DOTALL)

# matches[0]: Вдохновляйся (Step 01)
# matches[1]: Публикуй (Step 02)
# matches[2]: Открывай (Step 03) -> to be removed
# matches[3]: Выигрывай (Step 04) -> rename to Step 03

if len(matches) == 4:
    # We replace matches[3] to say "Шаг 03" and "ШАГ 03"
    new_match_3 = matches[3].replace('Шаг 04', 'Шаг 03').replace('ШАГ 04', 'ШАГ 03')
    
    # We rebuild the HTML
    # We need to find the start of the steps and replace the whole block
    start_idx = html.find(matches[0])
    end_idx = html.find(matches[3]) + len(matches[3])
    
    new_html = html[:start_idx] + matches[0] + matches[1] + new_match_3 + html[end_idx:]
    
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(new_html)
    print("Successfully removed step 3 and renamed step 4 to 3")
else:
    print(f"Error: found {len(matches)} steps instead of 4")
