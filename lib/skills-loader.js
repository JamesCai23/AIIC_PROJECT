import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(__dirname, '..', 'skills');

function parseSkillFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Parse JSON metadata from code block
  const metaMatch = content.match(/```json\n([\s\S]*?)```/);
  const meta = metaMatch ? JSON.parse(metaMatch[1]) : {};

  // Parse stage sections: ## 阶段 N ... (until next ## 阶段 or end of file)
  const stageRegex = /## 阶段 (\d)[\s\S]*?(?=## 阶段 \d|$)/g;
  const stages = {};
  let match;
  while ((match = stageRegex.exec(content)) !== null) {
    stages[parseInt(match[1])] = match[0].trim();
  }

  return { meta, stages };
}

let positionsCache = null;

export function loadAllPositions() {
  if (positionsCache) return positionsCache;

  const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.md'));
  const positions = {};
  for (const file of files) {
    const id = file.replace('.md', '');
    positions[id] = parseSkillFile(path.join(SKILLS_DIR, file));
  }

  positionsCache = positions;
  return positions;
}

export function getPositions() {
  return loadAllPositions();
}

export function getSkillContent(skillId) {
  const all = loadAllPositions();
  return all[skillId] || null;
}
