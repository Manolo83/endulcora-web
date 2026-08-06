const fs = require('fs');
const { DATA_DIR, UPLOAD_DIR, DB_PATH } = require('./config');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function load() {
  if (!fs.existsSync(DB_PATH)) {
    const initial = { announcements: [], media: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) {
    return { announcements: [], media: [] };
  }
}

function save(data) {
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

function nextId(list) {
  return list.reduce((max, item) => Math.max(max, item.id), 0) + 1;
}

module.exports = {
  getAnnouncements(onlyPublished = false) {
    const data = load();
    const items = [...data.announcements].sort((a, b) => b.id - a.id);
    return onlyPublished ? items.filter((a) => a.published) : items;
  },
  addAnnouncement({ title, body, published }) {
    const data = load();
    const item = {
      id: nextId(data.announcements),
      title,
      body,
      published: published !== false,
      createdAt: new Date().toISOString(),
    };
    data.announcements.push(item);
    save(data);
    return item;
  },
  updateAnnouncement(id, patch) {
    const data = load();
    const item = data.announcements.find((a) => a.id === Number(id));
    if (!item) return null;
    if (typeof patch.title === 'string') item.title = patch.title;
    if (typeof patch.body === 'string') item.body = patch.body;
    if (typeof patch.published === 'boolean') item.published = patch.published;
    save(data);
    return item;
  },
  deleteAnnouncement(id) {
    const data = load();
    data.announcements = data.announcements.filter((a) => a.id !== Number(id));
    save(data);
  },
  getMedia() {
    const data = load();
    return [...data.media].sort((a, b) => b.id - a.id);
  },
  addMedia({ kind, source, url, title, filename }) {
    const data = load();
    const item = {
      id: nextId(data.media),
      kind,
      source,
      url,
      title: title || '',
      filename: filename || null,
      createdAt: new Date().toISOString(),
    };
    data.media.push(item);
    save(data);
    return item;
  },
  deleteMedia(id) {
    const data = load();
    const item = data.media.find((m) => m.id === Number(id));
    data.media = data.media.filter((m) => m.id !== Number(id));
    save(data);
    return item;
  },
};
