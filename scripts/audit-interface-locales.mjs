import ts from 'typescript';import{readFileSync,readdirSync,writeFileSync}from'node:fs';import{join}from'node:path';
const catalogue=new Set(),files=[];
function walk(dir){for(const item of readdirSync(dir,{withFileTypes:true})){const path=join(dir,item.name);if(item.isDirectory())walk(path);else if(path.endsWith('.tsx'))files.push(path);}}
walk('app');walk('components');
for(const file of files){const source=readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 function strings(node){if(ts.isConditionalExpression(node)){strings(node.whenTrue);strings(node.whenFalse);}else if(ts.isStringLiteral(node)&&node.text&&/[A-Za-z]/.test(node.text))catalogue.add(node.text);else ts.forEachChild(node,strings);}
 function visit(node){
  if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(ast)==='T'){for(const child of node.children)strings(child);return;}
  if(ts.isCallExpression(node)&&['t','setNotice'].includes(node.expression.getText(ast))&&node.arguments[0])strings(node.arguments[0]);
  if(ts.isPropertyAssignment(node)&&['label','buttonLabel','nextLabel'].includes(node.name.getText(ast))&&ts.isStringLiteral(node.initializer))strings(node.initializer);
  if(file.replaceAll('\\','/').endsWith('components/ui/status-badge.tsx')&&ts.isVariableDeclaration(node)&&node.name.getText(ast)==='explanations'&&node.initializer)strings(node.initializer);
  if(file.replaceAll('\\','/').endsWith('components/catalog-directory.tsx')&&ts.isVariableDeclaration(node)&&node.name.getText(ast)==='guidance'&&node.initializer)strings(node.initializer);
  if(ts.isJsxAttribute(node)&&['title','description','eyebrow','label','placeholder','aria-label','intro','nextLabel','submit'].includes(node.name.getText(ast))&&node.initializer)strings(node.initializer);
  ts.forEachChild(node,visit);
 }visit(ast);
}
writeFileSync('lib/experience/interface-catalogue.json',JSON.stringify([...catalogue].sort(),null,2)+'\n');console.log(`${catalogue.size} declared interface messages.`);
