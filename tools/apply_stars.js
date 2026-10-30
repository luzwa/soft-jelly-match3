// Writes provisional star thresholds from a bot report (tools/bots.js) into levels/src/<id>.json (canonical, lossless),
// then re-bundle with `node tools/make_levels.js`. Stars are display / rating only; they never gate unlocking.
//   node tools/apply_stars.js levels/bot_report.json [id,id,...]
'use strict';
const fs = require('fs'), path = require('path');
const S = require('../js/level_schema.js');
const rep = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), only = process.argv[3] ? process.argv[3].split(',') : null;
const SRC = path.join(__dirname, '..', 'levels', 'src');
Object.keys(rep.levels).forEach(id => {
  if (only && !only.includes(id)) return;
  const f = path.join(SRC, id + '.json'); if (!fs.existsSync(f)) { console.log('skip (no src)', id); return; }
  const r = S.parse(fs.readFileSync(f, 'utf8')); if (!r.ok) throw new Error(id + ': ' + JSON.stringify(r.errors));
  const d = r.def, ps = rep.levels[id].provisionalStars;
  if (rep.levels[id].contentRevision !== d.contentRevision) throw new Error(id + ': report is for another contentRevision');
  d.scoring = Object.assign({}, d.scoring, { stars: ps.stars, starsStatus: 'provisional_bot_derived', starsMethod: ps.method, starsBasis: ps.basis + ' n=' + ps.sample + ', seeds ' + rep.seeds.from + '–' + rep.seeds.to, scoreVersion: rep.scoreVersion });
  fs.writeFileSync(f, S.serialize(d)); console.log(id, ps.stars.join('/'), ps.basis, ps.sample);
});
