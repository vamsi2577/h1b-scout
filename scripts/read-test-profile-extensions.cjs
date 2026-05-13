const fs = require("fs");

const prefs = JSON.parse(fs.readFileSync(".chrome-test-profile/Default/Preferences", "utf8"));
const settings = prefs.extensions?.settings || {};

for (const [id, setting] of Object.entries(settings)) {
  console.log(JSON.stringify({
    id,
    path: setting.path,
    manifestName: setting.manifest?.name,
    state: setting.state,
    disableReasons: setting.disable_reasons
  }));
}
