// hud.js — every DOM overlay: HUD readouts, crosshair spread, hitmarker,
// kill feed, round banner, buy menu, plant progress, and the start /
// round-end / match-end screens. Reads state; never simulates.
import { WEAPONS, WEAPON_ORDER, ARMOUR_PRICE, GRENADE_PRICE } from './state.js';
import { SITES } from './world.js';

export function createHud(state, callbacks) {
  const $ = (id) => document.getElementById(id);
  const els = {
    hp: $('hp'), armour: $('armour'), ammoMag: $('ammo-mag'), ammoRes: $('ammo-reserve'),
    money: $('money'), timer: $('timer'), scoreA: $('score-a'), scoreD: $('score-d'),
    round: $('round-label'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    feed: $('killfeed'), banner: $('banner'), bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'), buy: $('buy-menu'), buyList: $('buy-list'),
    plantBar: $('plant-bar'), plantFill: $('plant-fill'), plantLabel: $('plant-label'),
    overlay: $('overlay'), overlayTitle: $('overlay-title'), overlayCopy: $('overlay-copy'),
    playBtn: $('play'), hint: $('hint'), spike: $('spike-indicator'),
  };
  let hitT = null;
  let lastHp = -1;

  function fmtTime(s) { const t = Math.max(0, Math.ceil(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }

  function renderBuy() {
    const p = state.player;
    let html = '';
    for (const id of WEAPON_ORDER) {
      const w = WEAPONS[id];
      const owned = p.weaponId === id;
      const afford = state.money >= w.price;
      html += `<button class="buy-item ${owned ? 'owned' : ''} ${afford || owned ? '' : 'poor'}" data-buy="${id}">
        <b>${w.name}</b><span>$${w.price.toLocaleString()}</span>
        <small>DMG ${w.damage} · ${w.mag} rnd · ${w.auto ? 'AUTO' : 'SEMI'}</small></button>`;
    }
    html += `<button class="buy-item ${p.armour >= 100 ? 'owned' : ''}" data-buy="armour">
      <b>Kevlar Vest</b><span>$${ARMOUR_PRICE}</span><small>100 armour</small></button>`;
    html += `<button class="buy-item ${p.grenades >= 2 ? 'owned' : ''}" data-buy="grenade">
      <b>Frag Grenade</b><span>$${GRENADE_PRICE}</span><small>Press G · ${p.grenades}/2 held</small></button>`;
    els.buyList.innerHTML = html;
    els.buyList.querySelectorAll('[data-buy]').forEach((b) => {
      b.addEventListener('click', () => { callbacks.onBuy(b.dataset.buy); renderBuy(); });
    });
  }

  return {
    renderBuy,
    showHitmarker(head) {
      els.hitmarker.classList.add('on');
      els.hitmarker.classList.toggle('head', !!head);
      clearTimeout(hitT);
      hitT = setTimeout(() => els.hitmarker.classList.remove('on'), 120);
    },
    feed(text, good) {
      const div = document.createElement('div');
      div.className = 'feed-line' + (good ? ' good' : '');
      div.textContent = text;
      els.feed.prepend(div);
      while (els.feed.children.length > 5) els.feed.lastChild.remove();
      setTimeout(() => div.remove(), 6000);
    },
    banner(title, sub, ms) {
      els.bannerTitle.textContent = title;
      els.bannerSub.textContent = sub || '';
      els.banner.hidden = false;
      if (ms) setTimeout(() => { els.banner.hidden = true; }, ms);
    },
    hideBanner() { els.banner.hidden = true; },
    showOverlay(title, copy, btn) {
      els.overlayTitle.textContent = title;
      els.overlayCopy.textContent = copy;
      els.playBtn.textContent = btn;
      els.overlay.hidden = false;
    },
    hideOverlay() { els.overlay.hidden = true; },
    update(dt) {
      const p = state.player;
      if (!p) return;
      els.hp.textContent = Math.max(0, Math.ceil(p.hp));
      els.hp.parentElement.classList.toggle('low', p.hp <= 30);
      els.armour.textContent = Math.ceil(p.armour);
      const w = WEAPONS[p.weaponId];
      els.ammoMag.textContent = p.reloadT > 0 ? '--' : p.mag;
      els.ammoRes.textContent = `/ ${p.reserve}`;
      document.getElementById('weapon-name').textContent = `${w.name} · ${p.grenades} grenade${p.grenades === 1 ? '' : 's'}`;
      els.ammoMag.parentElement.classList.toggle('empty', p.mag === 0);
      els.money.textContent = `$${state.money.toLocaleString()}`;
      els.timer.textContent = fmtTime(state.timer);
      els.scoreA.textContent = state.score.attack;
      els.scoreD.textContent = state.score.defend;
      els.round.textContent = `ROUND ${state.round}`;
      const spread = 10 + (w.spread + w.moveSpread * (p.moving ? 1 : 0) + p.spreadBloom) * 900 + p.recoil * 160;
      els.crosshair.style.setProperty('--gap', `${Math.min(26, spread).toFixed(1)}px`);
      // Plant / defuse bar.
      const sp = state.spike;
      if (sp.state === 'planting' || sp.state === 'defusing') {
        els.plantBar.hidden = false;
        els.plantFill.style.width = `${Math.round(sp.progress * 100)}%`;
        els.plantLabel.textContent = sp.state === 'planting' ? 'PLANTING SPIKE…' : 'SPIKE BEING DEFUSED!';
      } else if (sp.state === 'planted') {
        els.plantBar.hidden = false;
        els.plantFill.style.width = `${Math.round((sp.fuse / 25) * 100)}%`;
        els.plantLabel.textContent = `SPIKE ARMED — ${Math.ceil(sp.fuse)}s · SITE ${sp.site} (${SITES[sp.site].name})`;
      } else {
        els.plantBar.hidden = true;
      }
      els.spike.textContent = p.hasSpike ? '◆ SPIKE CARRIER — reach a site, hold E' : (sp.state === 'planted' ? '◆ SPIKE PLANTED' : '');
      els.spike.hidden = state.phase !== 'live';
      // Buy menu only during buy phase.
      const showBuy = state.phase === 'buy';
      els.buy.hidden = !showBuy;
      if (showBuy && !els.buy.dataset.rendered) { renderBuy(); els.buy.dataset.rendered = '1'; }
      if (!showBuy) delete els.buy.dataset.rendered;
      // Context hint.
      let hint = '';
      if (state.phase === 'buy') hint = 'BUY PHASE — B opens the shop · click PLAY or wait for the round';
      else if (state.phase === 'live') {
        if (sp.state === 'carried' && p.hasSpike) hint = 'Carry the spike to Site A (Foundry) or Site B (Depot) — hold E to plant';
        else if (sp.state === 'planted') hint = 'Defend the spike! Enemies will try to defuse it.';
        else hint = 'Eliminate the defenders or plant the spike';
      }
      els.hint.textContent = hint;
      if (p.hp !== lastHp) { lastHp = p.hp; }
    },
  };
}
