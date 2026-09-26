for filename in ['index.html', 'catalog.html']:
    with open(filename, 'r', encoding='utf-8') as f:
        html = f.read()
    # Fix onclick to stop propagation so the label doesn't intercept the click
    html = html.replace(
        'onclick="openTermsModal();return false;">условиями использования</a>',
        'onclick="event.stopPropagation();openTermsModal();return false;">условиями использования</a>'
    )
    html = html.replace(
        'onclick="openTermsModal();return false;">политикой публикации</a>',
        'onclick="event.stopPropagation();openTermsModal();return false;">политикой публикации</a>'
    )
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'Fixed {filename}')
