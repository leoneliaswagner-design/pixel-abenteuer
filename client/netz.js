// Die Verbindung zum Spielserver. Nachrichten, die ankommen, bevor die Szene
// zuhört, werden aufgehoben — sonst ginge z. B. ein Busch verloren, der
// zwischen „willkommen" und dem Aufbau der Karte geschnitten wurde.
export class Netz {
  constructor() {
    this.hoerer = new Map();
    this.wartend = [];
    this.offen = false;
  }

  verbinden(name) {
    return new Promise((gut, schlecht) => {
      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
      const ws = new WebSocket(url);
      this.ws = ws;
      let angekommen = false;
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hallo', name }));
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.t === 'willkommen') {
          angekommen = true;
          gut(m);
        } else if (m.t === 'voll') schlecht(new Error('Das Spiel ist voll — es sind schon vier Leute da.'));
        else this.verteilen(m);
      };
      ws.onclose = () => {
        if (!angekommen) schlecht(new Error('Keine Verbindung zum Spielserver. Läuft er?'));
        else this.verteilen({ t: 'getrennt' });
      };
    });
  }

  bei(art, fn) {
    if (!this.hoerer.has(art)) this.hoerer.set(art, []);
    this.hoerer.get(art).push(fn);
  }

  // Ab jetzt hört die Szene zu: Aufgestautes nachliefern.
  bereit() {
    this.offen = true;
    for (const m of this.wartend.splice(0)) this.verteilen(m);
  }

  verteilen(m) {
    if (!this.offen) {
      // Alte Stände braucht niemand, nur Ereignisse.
      if (m.t !== 'stand') this.wartend.push(m);
      return;
    }
    for (const fn of this.hoerer.get(m.t) ?? []) fn(m);
  }

  senden(m) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }
}
