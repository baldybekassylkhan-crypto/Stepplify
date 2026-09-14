
const fs = require('fs');
let code = fs.readFileSync('script.js', 'utf8');

const updateLogic = 
  const artContentCounter = document.getElementById('artContentCounter');
  const getWordCount = (str) => str.trim().split(/\s+/).filter(w => w.length > 0).length;
  const updateWordCounter = () => {
    if (artContentCounter && typeof artContentEl !== 'undefined') {
      const words = getWordCount(artContentEl.value);
      artContentCounter.textContent = \\ / 1000 слов (мин. 500)\;
      if (words < 500 || words > 1000) {
        artContentCounter.style.color = '#ff6b6b';
      } else {
        artContentCounter.style.color = 'rgba(255,255,255,0.5)';
      }
    }
  };
;

code = code.replace(
  '  let aiCheckBlocksPublish = false;',
  '  let aiCheckBlocksPublish = false;\n' + updateLogic
);

code = code.replace(
  '    if (aiResultBox) aiResultBox.hidden = true;',
  '    if (aiResultBox) aiResultBox.hidden = true; updateWordCounter();'
);

code = code.replace(
  '    document.getElementById(\'artContent\').value = article.content || \'\';',
  '    document.getElementById(\'artContent\').value = article.content || \'\'; updateWordCounter();'
);

code = code.replace(
  /document\.getElementById\('publishForm'\)\.reset\(\);/g,
  'document.getElementById(\'publishForm\').reset(); if(typeof updateWordCounter !== \'undefined\') updateWordCounter();'
);

code = code.replace(
  '    if (aiCheckBlocksPublish) {',
      const currentWords = getWordCount(artContentEl.value);
    if (currentWords < 500) {
      document.getElementById('publishError').textContent = 'Статья слишком короткая (минимум 500 слов). Сейчас: ' + currentWords;
      return;
    }
    if (currentWords > 1000) {
      document.getElementById('publishError').textContent = 'Статья слишком длинная (максимум 1000 слов). Сейчас: ' + currentWords;
      return;
    }
    if (aiCheckBlocksPublish) {
);

fs.writeFileSync('script.js', code);
