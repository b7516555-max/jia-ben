const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const shell = fs.readFileSync('src/core/uiShell.js', 'utf8');
const notes = fs.readFileSync('src/config/releaseNotes.js', 'utf8');

assert.ok(html.includes('explore-city-tags') && html.includes('explore-scenario-tags'), 'Explore has wrapping city and scenario filters');
assert.ok(html.includes('explore-hot-list') && html.includes('No.${index + 1}'), 'Explore renders a Top 5 hot list with rank badges');
assert.ok(html.includes('renderExploreDiscovery') && html.includes('cityCounts'), 'City counts are calculated from current local places');
assert.ok(html.includes('renderActiveFoodieBoard') && html.includes('getUserLevel'), 'Feed has a local active foodie leaderboard');
assert.ok(html.includes('profile-food-map-btn') && html.includes('showUserFoodMap'), 'User profile exposes the food map action');
assert.ok(html.includes('id="view-privacy"') && html.includes('隱私權與資料說明'), 'Privacy page and Traditional Chinese content exist');
assert.ok(shell.includes("'privacy'") && shell.includes('PAGE_TITLES'), 'Privacy is included in the independent page router');
assert.ok(html.includes('window.switchTab(\'privacy\')'), 'Welcome and login surfaces link to privacy');
assert.ok(notes.includes('v141'), 'Release notes include v141');
console.log('✅ Hot list, foodie leaderboard, profile map, and privacy contracts passed');
