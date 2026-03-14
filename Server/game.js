const { TERRITORIES, ADJACENCIES, CONTINENTS } = require('./territories');

const EVENTS = [
  { id: 'rain', name: '🌧️ Pluie torrentielle', desc: 'Vitesse de marche réduite de 1 tour supplémentaire', duration: 2, effect: 'slow_march' },
  { id: 'sandstorm', name: '🌪️ Tempête de sable', desc: 'Visibilité réduite : brouillard étendu', duration: 1, effect: 'fog_extended' },
  { id: 'wind', name: '💨 Vent violent', desc: 'Max 10 soldats peuvent marcher par tour', duration: 2, effect: 'limit_march' },
  { id: 'flood', name: '🌊 Inondation', desc: 'Chaque territoire perd 1 soldat', duration: 1, effect: 'flood_loss' },
];

// BFS pour trouver la distance minimale entre deux territoires (tous chemins, pas uniquement alliés)
function getDistance(fromId, toId) {
  if (fromId === toId) return 0;
  const visited = new Set();
  const queue = [[fromId, 0]];
  while (queue.length) {
    const [current, dist] = queue.shift();
    if (current === toId) return dist;
    if (visited.has(current)) continue;
    visited.add(current);
    (ADJACENCIES[current] || []).forEach(n => {
      if (!visited.has(n)) queue.push([n, dist + 1]);
    });
  }
  return Infinity;
}

// BFS pour trouver le chemin le plus court entre deux territoires
function getPath(fromId, toId) {
  if (fromId === toId) return [fromId];
  const visited = new Set();
  const queue = [[fromId, [fromId]]];
  while (queue.length) {
    const [current, path] = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    for (const n of (ADJACENCIES[current] || [])) {
      const newPath = [...path, n];
      if (n === toId) return newPath;
      if (!visited.has(n)) queue.push([n, newPath]);
    }
  }
  return [fromId, toId];
}

class GameEngine {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = {};
    this.playerOrder = [];
    this.currentPlayerIndex = 0;
    this.phase = 'lobby';
    this.turn = 0;
    this.territories = {};
    this.activeEvents = [];
    this.diplomaticMessages = [];
    this.log = [];
    this.winner = null;
    this.deploymentLeft = 0;

    // Armées en marche : { id, owner, soldiers, from, to, path, turnsLeft, arrivalTurn }
    this.marchingArmies = [];
    this._nextArmyId = 1;
  }

  addPlayer(id, name) {
    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
    const usedColors = Object.values(this.players).map(p => p.color);
    const color = colors.find(c => !usedColors.includes(c)) || colors[0];
    this.players[id] = { id, name, color, gold: 0, connected: true };
    this.addLog(`${name} a rejoint la partie.`);
    return this.players[id];
  }

  removePlayer(id) {
    if (this.players[id]) {
      this.players[id].connected = false;
      this.addLog(`${this.players[id].name} s'est déconnecté.`);
    }
  }

  getPlayerCount() {
    return Object.keys(this.players).length;
  }

  startGame() {
    if (this.getPlayerCount() < 2) return { error: 'Il faut au moins 2 joueurs.' };

    Object.keys(TERRITORIES).forEach(tid => {
      this.territories[tid] = { owner: null, soldiers: 0 };
    });

    this.playerOrder = Object.keys(this.players).sort(() => Math.random() - 0.5);

    const territoryKeys = Object.keys(TERRITORIES).sort(() => Math.random() - 0.5);
    this.playerOrder.forEach((pid, i) => {
      const tid = territoryKeys[i];
      this.territories[tid] = { owner: pid, soldiers: 3 };
    });

    this.turn = 1;
    this.currentPlayerIndex = 0;
    this.startPhase('production');
    return { ok: true };
  }

  get currentPlayer() {
    return this.playerOrder[this.currentPlayerIndex];
  }

  startPhase(phase) {
    this.phase = phase;
    const pid = this.currentPlayer;
    const player = this.players[pid];

    if (phase === 'production') {
      // ── Production pour tous ──
      this.playerOrder.forEach(p => {
        const count = this.getPlayerTerritories(p).length;
        this.players[p].gold += count;
      });

      // ── Résolution des armées en marche arrivées ──
      this._resolveArrivals();

      // ── Avance toutes les armées en marche ──
      this.marchingArmies = this.marchingArmies.map(a => ({ ...a, turnsLeft: a.turnsLeft - 1 }));

      // ── Événement aléatoire ──
      if (Math.random() < 0.2) {
        const ev = EVENTS[Math.floor(Math.random() * EVENTS.length)];
        const duration = 1 + Math.floor(Math.random() * 3);
        this.activeEvents.push({ ...ev, turnsLeft: duration });
        this.addLog(`⚠️ Événement : ${ev.name} (${duration} tour(s)) — ${ev.desc}`);
        if (ev.effect === 'flood_loss') {
          Object.keys(this.territories).forEach(tid => {
            const t = this.territories[tid];
            if (t.owner && t.soldiers > 1) t.soldiers--;
          });
        }
      }

      this.activeEvents = this.activeEvents
        .map(e => ({ ...e, turnsLeft: e.turnsLeft - 1 }))
        .filter(e => e.turnsLeft > 0);

      this.addLog(`🌍 Tour ${this.turn} — Production : chaque territoire rapporte 1 or.`);

      // Afficher les armées en route
      this.marchingArmies.forEach(a => {
        const ownerName = this.players[a.owner]?.name || '?';
        const dest = TERRITORIES[a.to]?.name || a.to;
        this.addLog(`🚶 Armée de ${ownerName} en route vers ${dest} — arrive dans ${a.turnsLeft} tour(s).`);
      });

      this.startPhase('deployment');
      return;
    }

    if (phase === 'deployment') {
      const territories = this.getPlayerTerritories(pid);
      let renforts = Math.max(3, 3 + Math.floor(territories.length / 2));
      Object.keys(CONTINENTS).forEach(cid => {
        const contTerr = Object.keys(TERRITORIES).filter(tid => TERRITORIES[tid].continent === cid);
        if (contTerr.every(tid => this.territories[tid].owner === pid)) {
          renforts += CONTINENTS[cid].bonus;
        }
      });
      this.deploymentLeft = renforts;
      this.addLog(`🪖 ${player.name} reçoit ${renforts} renforts.`);
    }
  }

  // ── Résoudre les combats des armées arrivées ──────────────────────────────
  _resolveArrivals() {
    const arrived = this.marchingArmies.filter(a => a.turnsLeft <= 0);
    this.marchingArmies = this.marchingArmies.filter(a => a.turnsLeft > 0);

    arrived.forEach(army => {
      const dest = this.territories[army.to];
      const attackerName = this.players[army.owner]?.name || '?';
      const destName = TERRITORIES[army.to]?.name || army.to;

      if (!dest.owner || dest.owner === army.owner) {
        // Territoire vide ou déjà à nous → renfort
        dest.owner = army.owner;
        dest.soldiers += army.soldiers;
        this.addLog(`✅ L'armée de ${attackerName} arrive à ${destName} (${army.soldiers} soldats) — territoire rejoint !`);
      } else {
        // Combat !
        const defenderOwner = dest.owner;
        const defenderName = this.players[defenderOwner]?.name || '?';
        const attackers = army.soldiers;
        const defenders = dest.soldiers;
        const result = attackers - defenders;

        if (result > 0) {
          dest.owner = army.owner;
          dest.soldiers = result;
          this.addLog(`⚔️ Armée de ${attackerName} arrive à ${destName} : ${attackers} vs ${defenders} → VICTOIRE ! ${result} survivant(s).`);
          this.checkPlayerEliminated(defenderOwner);
        } else if (result === 0) {
          dest.soldiers = 1;
          this.addLog(`⚔️ Armée de ${attackerName} arrive à ${destName} : ${attackers} vs ${defenders} → ÉGALITÉ, le défenseur tient !`);
        } else {
          dest.soldiers = Math.abs(result);
          this.addLog(`⚔️ Armée de ${attackerName} arrive à ${destName} : ${attackers} vs ${defenders} → ÉCHEC, ${Math.abs(result)} défenseur(s) survivent.`);
        }
        this.checkWinCondition();
      }
    });
  }

  deployTroops(playerId, territoryId, amount) {
    if (this.phase !== 'deployment' || this.currentPlayer !== playerId)
      return { error: 'Pas ton tour ou mauvaise phase.' };
    if (this.territories[territoryId]?.owner !== playerId)
      return { error: 'Ce territoire ne t\'appartient pas.' };
    if (amount > this.deploymentLeft || amount < 1)
      return { error: `Tu peux déployer au max ${this.deploymentLeft} soldats.` };

    this.territories[territoryId].soldiers += amount;
    this.deploymentLeft -= amount;
    this.addLog(`🪖 ${this.players[playerId].name} déploie ${amount} soldat(s) en ${TERRITORIES[territoryId].name}.`);
    return { ok: true, deploymentLeft: this.deploymentLeft };
  }

  // ── Lancer une armée vers n'importe quel territoire ──────────────────────
  launchArmy(attackerId, fromId, toId, amount) {
    if (this.phase !== 'attack' || this.currentPlayer !== attackerId)
      return { error: 'Pas ton tour ou mauvaise phase.' };

    const from = this.territories[fromId];
    if (from.owner !== attackerId)
      return { error: 'Tu ne contrôles pas ce territoire.' };
    if (toId === fromId)
      return { error: 'Territoire de départ et d\'arrivée identiques.' };
    if (from.soldiers <= amount)
      return { error: 'Pas assez de soldats (il faut en garder au moins 1).' };
    if (amount < 1)
      return { error: 'Lance au moins 1 soldat.' };

    // Vérifie que la cible n'est pas déjà au joueur (sauf si c'est un renfort)
    const to = this.territories[toId];
    if (to.owner === attackerId) {
      return { error: 'Utilise la phase de mouvement pour déplacer des troupes vers tes propres territoires.' };
    }

    // Calcule la distance et le chemin
    const path = getPath(fromId, toId);
    const distance = path.length - 1; // nombre de sauts

    // Malus événement pluie : +1 tour
    const slowBonus = this.activeEvents.some(e => e.effect === 'slow_march') ? 1 : 0;

    // Distance 0 = adjacent = arrive ce tour (turnsLeft = 0 → résolu en début de prochain tour prod)
    // Distance 1 = 1 tour de trajet, etc.
    const turnsLeft = distance + slowBonus;

    // Malus vent : max 10 soldats
    const maxMarch = this.activeEvents.some(e => e.effect === 'limit_march') ? 10 : Infinity;
    if (amount > maxMarch)
      return { error: `Vent violent : max ${maxMarch} soldats peuvent marcher.` };

    // Retire les soldats du territoire source
    from.soldiers -= amount;

    const army = {
      id: this._nextArmyId++,
      owner: attackerId,
      soldiers: amount,
      from: fromId,
      to: toId,
      path,
      turnsLeft,
      launchedTurn: this.turn,
    };
    this.marchingArmies.push(army);

    const ownerName = this.players[attackerId].name;
    const destName = TERRITORIES[toId]?.name || toId;
    const srcName = TERRITORIES[fromId]?.name || fromId;

    if (turnsLeft === 0) {
      this.addLog(`⚔️ ${ownerName} envoie ${amount} soldats de ${srcName} → ${destName} (attaque immédiate !)`);
    } else {
      this.addLog(`🚶 ${ownerName} envoie ${amount} soldats de ${srcName} → ${destName} (arrivée dans ${turnsLeft} tour(s), distance ${distance}).`);
    }

    return { ok: true, turnsLeft, distance };
  }

  moveTroops(playerId, fromId, toId, amount) {
    if (this.phase !== 'movement' || this.currentPlayer !== playerId)
      return { error: 'Pas ton tour ou mauvaise phase.' };

    const from = this.territories[fromId];
    const to = this.territories[toId];

    if (from.owner !== playerId) return { error: 'Tu ne contrôles pas ce territoire.' };
    if (to.owner !== playerId) return { error: 'Destination non alliée — utilise Attaque pour envoyer des troupes chez l\'ennemi.' };
    if (from.soldiers <= amount) return { error: 'Pas assez de soldats (il faut en garder au moins 1).' };

    const maxHops = this.activeEvents.some(e => e.effect === 'slow_march') ? 1 : 3;
    if (!this.isConnected(playerId, fromId, toId, maxHops))
      return { error: `Tes territoires ne sont pas connectés sur ${maxHops} case(s).` };

    if (to.soldiers + amount > 20)
      return { error: 'Max 20 soldats par territoire.' };

    const maxMove = this.activeEvents.some(e => e.effect === 'limit_march') ? 10 : Infinity;
    if (amount > maxMove) return { error: `Vent violent : max ${maxMove} soldats déplacés.` };

    from.soldiers -= amount;
    to.soldiers += amount;
    this.addLog(`🚶 ${this.players[playerId].name} déplace ${amount} soldats de ${TERRITORIES[fromId].name} vers ${TERRITORIES[toId].name}.`);
    return { ok: true };
  }

  isConnected(playerId, startId, endId, maxHops) {
    const visited = new Set();
    const queue = [[startId, 0]];
    while (queue.length) {
      const [current, hops] = queue.shift();
      if (current === endId) return true;
      if (hops >= maxHops) continue;
      if (visited.has(current)) continue;
      visited.add(current);
      (ADJACENCIES[current] || []).forEach(n => {
        if (this.territories[n]?.owner === playerId && !visited.has(n)) {
          queue.push([n, hops + 1]);
        }
      });
    }
    return false;
  }

  sendDiplomacy(fromId, toId, message, goldAmount) {
    if (!this.players[fromId] || !this.players[toId]) return { error: 'Joueur introuvable.' };
    this.diplomaticMessages.push({ from: fromId, to: toId, message, timestamp: Date.now() });
    if (goldAmount > 0) {
      if (this.players[fromId].gold < goldAmount) return { error: 'Pas assez d\'or.' };
      this.players[fromId].gold -= goldAmount;
      this.players[toId].gold += goldAmount;
      this.addLog(`💱 ${this.players[fromId].name} transfère ${goldAmount} or à ${this.players[toId].name}.`);
    }
    return { ok: true };
  }

  nextPhase(playerId) {
    if (this.currentPlayer !== playerId) return { error: 'Pas ton tour.' };
    const phases = ['deployment', 'diplomacy', 'attack', 'movement'];
    const idx = phases.indexOf(this.phase);
    if (idx === -1 || idx === phases.length - 1) {
      this.endTurn();
    } else {
      this.startPhase(phases[idx + 1]);
    }
    return { ok: true };
  }

  endTurn() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.playerOrder.length;
    if (this.currentPlayerIndex === 0) this.turn++;
    this.startPhase('production');
  }

  checkPlayerEliminated(playerId) {
    if (!playerId) return;
    const territories = this.getPlayerTerritories(playerId);
    // Un joueur est éliminé s'il n'a plus de territoire ET plus d'armées en marche
    const armies = this.marchingArmies.filter(a => a.owner === playerId);
    if (territories.length === 0 && armies.length === 0) {
      this.addLog(`💀 ${this.players[playerId].name} est éliminé !`);
      this.playerOrder = this.playerOrder.filter(id => id !== playerId);
      if (this.currentPlayerIndex >= this.playerOrder.length) this.currentPlayerIndex = 0;
    }
  }

  checkWinCondition() {
    const total = Object.keys(TERRITORIES).length;
    for (const pid of this.playerOrder) {
      if (this.getPlayerTerritories(pid).length === total) {
        this.winner = pid;
        this.phase = 'gameover';
        this.addLog(`🏆 ${this.players[pid].name} a conquis tous les territoires ! Victoire !`);
        return;
      }
    }
  }

  getPlayerTerritories(playerId) {
    return Object.keys(this.territories).filter(tid => this.territories[tid].owner === playerId);
  }

  getVisibleTerritories(playerId) {
    const visible = new Set();
    Object.keys(this.territories).forEach(tid => {
      if (this.territories[tid].owner === playerId) {
        visible.add(tid);
        (ADJACENCIES[tid] || []).forEach(n => visible.add(n));
      }
    });
    return visible;
  }

  getStateForPlayer(playerId) {
    const visible = this.getVisibleTerritories(playerId);
    const fogExtended = this.activeEvents.some(e => e.effect === 'fog_extended');

    const territories = {};
    Object.keys(this.territories).forEach(tid => {
      const t = this.territories[tid];
      if (t.owner === playerId || (visible.has(tid) && !fogExtended)) {
        territories[tid] = { ...t };
      } else {
        territories[tid] = { owner: null, soldiers: 0, hidden: true };
      }
    });

    // Armées visibles : les miennes + celles qui passent par mes territoires
    const visibleArmies = this.marchingArmies.filter(army => {
      if (army.owner === playerId) return true;
      // Visible si le chemin traverse un territoire visible
      return army.path.some(tid => visible.has(tid));
    }).map(army => ({
      id: army.id,
      owner: army.owner,
      soldiers: army.soldiers,
      from: army.from,
      to: army.to,
      turnsLeft: army.turnsLeft,
      ismine: army.owner === playerId,
    }));

    const messages = this.diplomaticMessages.filter(m => m.from === playerId || m.to === playerId);

    return {
      phase: this.phase,
      turn: this.turn,
      currentPlayer: this.currentPlayer,
      players: this.players,
      playerOrder: this.playerOrder,
      territories,
      activeEvents: this.activeEvents,
      deploymentLeft: this.deploymentLeft,
      log: this.log.slice(-40),
      winner: this.winner,
      myMessages: messages,
      myGold: this.players[playerId]?.gold || 0,
      marchingArmies: visibleArmies,
    };
  }

  addLog(msg) {
    const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    this.log.push(`[${time}] ${msg}`);
    if (this.log.length > 120) this.log.shift();
  }
}

module.exports = { GameEngine };
