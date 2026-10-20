import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getIcon, iconSvg, searchIcons, suggestIcons } from '../src/icons.ts';

test('specific foods and toiletries are discoverable by name and common shopping terms', () => {
  const examples = [
    ['pasta', 'spaghetti'], ['fish', 'salmon fillet'], ['kimchi', 'kimchee'],
    ['chicken', 'rotisserie chicken'], ['yogurt', 'greek yoghurt'], ['broccoli', 'broccolini'],
    ['shampoo', 'hair conditioner'], ['body-wash', 'shower gel'], ['hand-soap', 'hand washing soap dispenser'],
  ];
  for (const [id, description] of examples) {
    const icon = getIcon(id);
    assert.equal(icon.id, id);
    assert.equal(suggestIcons(icon.label)[0]?.id, id);
    assert.equal(suggestIcons(description)[0]?.id, id, description);
    assert.ok(searchIcons(description, icon.category).some(icon => icon.id === id), description);
  }
  assert.equal(getIcon('future-food-icon').id, 'receipt');
  assert.equal(iconSvg('<script>alert(1)</script>'), iconSvg('receipt'));
});
