const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'docs/sources/computer-science-roadmap.md'), 'utf8');
const section = source.split('## 7. 最终知识范围')[1]?.split('## 8.')[0];
if (!section) throw new Error('缺少知识范围章节');
const nodes = [];
let parent;
for (const line of section.split(/\r?\n/)) {
  const heading = line.match(/^\d+\. \*\*(.+)\*\*/);
  if (heading) {
    parent = `module-${String(nodes.filter(n => !n.parent).length + 1).padStart(2, '0')}`;
    nodes.push({ id: parent, title: heading[1], type: 'concept', tags: ['学科分类'] });
    continue;
  }
  const item = line.match(/^\s+- (.+)$/);
  if (item && parent) nodes.push({ id: `${parent}-${nodes.filter(n => n.parent === parent).length + 1}`, title: item[1], type: 'concept', parent, tags: ['学习主题'] });
}
if (nodes.filter(n => !n.parent).length !== 15) throw new Error('应包含15个核心模块');
const bundle = { subject: { id: 'computer-science', title: '计算机科学与技术', description: '学科思维导图；分类不代表历史先后或严格学习依赖。原始路线见 docs/sources/computer-science-roadmap.md。' }, stages: [], nodes, relations: [] };
const output = JSON.stringify(bundle, null, 2) + '\n';
const destination = path.join(root, 'schemas/examples/computer-science.json');
if (process.argv.includes('--check')) {
  if (fs.readFileSync(destination, 'utf8') !== output) throw new Error('示例与来源不一致，请重新生成');
} else fs.writeFileSync(destination, output);
console.log(JSON.stringify({ modules: 15, topics: nodes.length - 15, sourceSha256: crypto.createHash('sha256').update(source).digest('hex') }));
