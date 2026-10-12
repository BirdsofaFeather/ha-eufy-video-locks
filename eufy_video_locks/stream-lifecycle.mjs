// A lease covers both opening and watching. Only the last release closes a
// dedicated media client; this never owns the main status/control client.
export function createStreamClientPool({ makeClient, makeOptions, loginOk, teardownMs = 1500 }) {
  const records = new Map();

  async function close(sn, record) {
    if (record.closing) return record.closing;
    clearTimeout(record.timer);
    record.closing = (async () => {
      try {
        const client = await record.pending;
        await client.disconnect?.();
      } catch { /* Login/open failure still releases the cache entry. */ }
      finally { if (records.get(sn) === record) records.delete(sn); }
    })();
    return record.closing;
  }

  async function acquire(sn, cfg) {
    let record = records.get(sn);
    if (record?.closing) {
      await record.closing;
      return acquire(sn, cfg);
    }
    if (record?.retired) throw new Error("Failed media client is waiting for its existing viewers to leave");
    if (!record) {
      record = { refs: 0, retired: false };
      records.set(sn, record);
      record.pending = (async () => {
        const client = makeClient(makeOptions(cfg), sn);
        record.client = client;
        try {
          const result = await client.login();
          if (result.status !== loginOk) throw new Error("Media client could not hydrate its saved session");
          return client;
        } catch (error) {
          await client.disconnect?.().catch(() => {});
          throw error;
        }
      })();
    }
    clearTimeout(record.timer);
    record.refs++;
    let released = false;
    const release = ({ failed = false } = {}) => {
      if (released) return;
      released = true;
      record.retired ||= failed;
      record.refs--;
      if (record.refs === 0) {
        if (record.retired) void close(sn, record);
        else {
          record.timer = setTimeout(() => void close(sn, record), teardownMs);
          record.timer.unref?.();
        }
      }
    };
    try { return { client: await record.pending, release }; }
    catch (error) { release({ failed: true }); throw error; }
  }

  function drop(sn, expectedClient) {
    const record = records.get(sn);
    if (!record || (expectedClient && record.client !== expectedClient)) return false;
    record.retired = true;
    if (record.refs === 0) void close(sn, record);
    return true;
  }

  async function closeAll() {
    await Promise.all([...records].map(([sn, record]) => close(sn, record)));
  }
  return { acquire, drop, closeAll };
}
