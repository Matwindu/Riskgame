const { TERRITORIES, ADJACENCIES, CONTINENTS } = require('./territories');

const EVENTS = [
  { id: 'rain', name: '🌧️ Pluie torrentielle', desc: 'Déplacements réduits à 1 territoire', duration: 2, effect: 'reduce_movement' },
  { id: 'sandstorm', name: '🌪️ Tempête de sable', desc: 'Visibilité réduite : brouillard étendu', duration: 1, effect: 'fog_extended' },
  { id: 'wind', name: '💨 Vent violent', desc: 'Max 10 soldats déplacés par tour', duration: 2, effect: 'limit_movement' },
  { id: 'flood', name: '🌊 Inondation', desc: 'Chaque territoire perd 1 soldat', duration: 1, effect: 'flood_loss' },
];

class GameEngine {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = {}; // id -> { name, color, gold, territories }
    this.playerOrder = [];
    this.currentPlayerIndex = 0;
    this.phase = 'lobby'; // lobby, production, deployment, diplomacy, attack, movement, gameover
    this.turn = 0;
    this.territories = {}; // territoryId -> { owner: playerId, soldiers: n }
    this.activeEvents = [];
    this.diplomaticMessages = []; // { from, to, message, timestamp }
    this.goldTransfers = []; // pending
    this.log = [];
    this.winner = null;
    this.deploymentLeft = 0;
    this.attacksDoneThisTurn = false;
    this.movementDoneThisTurn = false;
    this.pendingAlliances = {}; // playerId -> { target, goldOffer }
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

    // Init territories
    Object.keys(TERRITORIES).forEach(tid => {
      this.territories[tid] = { owner: null, soldiers: 0 };
    });

    // Random order
    this.playerOrder = Object.keys(this.players).sort(() => Math.random() - 0.5);

    // Assign 1 random starting territory per player
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
      // Production for ALL players
      this.playerOrder.forEach(pid => {
        const territories = this.getPlayerTerritories(pid);
        const gold = territories.length;
        this.players[pid].gold += gold;
      });

      // Random event
      if (Math.random() < 0.2 && EVENTS.length > 0) {
        const ev = EVENTS[Math.floor(Math.random() * EVENTS.length)];
        const duration = 1 + Math.floor(Math.random() * 3);
        this.activeEvents.push({ ...ev, turnsLeft: duration });
        this.addLog(`⚠️ Événement : ${ev.name} (${duration} tour(s)) — ${ev.desc}`);

        // Apply flood immediately
        if (ev.effect === 'flood_loss') {
          Object.keys(this.territories).forEach(tid => {
            const t = this.territories[tid];
            if (t.owner && t.soldiers > 1) t.soldiers--;
          });
        }
      }

      // Decrement events
      this.activeEvents = this.activeEvents
        .map(e => ({ ...e, turnsLeft: e.turnsLeft - 1 }))
        .filter(e => e.turnsLeft > 0);

      this.addLog(`🌍 Tour ${this.turn} — Production : chaque territoire rapporte 1 or.`);
      this.startPhase('deployment');
      return;
    }

    if (phase === 'deployment') {
      const territories = this.getPlayerTerritories(pid);
      let renforts = Math.max(3, 3 + Math.floor(territories.length / 2));

      // Continent bonus
      Object.keys(CONTINENTS).forEach(cid => {
        const contTerritories = Object.keys(TERRITORIES).filter(tid => TERRITORIES[tid].continent === cid);
        const ownsAll = contTerritories.every(tid => this.territories[tid].owner === pid);
        if (ownsAll) renforts += CONTINENTS[cid].bonus;
      });

      this.deploymentLeft = renforts;
      this.addLog(`🪖 ${player.name} reçoit ${renforts} renforts.`);
    }

    if (phase === 'attack') {
      this.attacksDoneThisTurn = false;
    }

    if (phase === 'movement') {
      this.movementDoneThisTurn = false;
    }
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

    const player = this.players[playerId];
    this.addLog(`🪖 ${player.name} déploie ${amount} soldat(s) en ${TERRITORIES[territoryId].name}.`);

    return { ok: true, deploymentLeft: this.deploymentLeft };
  }

  attack(attackerId, fromId, toId, amount) {
    if (this.phase !== 'attack' || this.currentPlayer !== attackerId)
      return { error: 'Pas ton tour ou mauvaise phase.' };

    const from = this.territories[fromId];
    const to = this.territories[toId];

    if (from.owner !== attackerId) return { error: 'Tu ne contrôles pas ce territoire.' };
    if (to.owner === attackerId) return { error: 'Tu ne peux pas attaquer ton propre territoire.' };
    if (!ADJACENCIES[fromId]?.includes(toId)) return { error: 'Ces territoires ne sont pas adjacents.' };
    if (from.soldiers <= amount) return { error: 'Pas assez de soldats (il faut en garder au moins 1).' };
    if (amount < 1) return { error: 'Attaque avec au moins 1 soldat.' };

    const attackerName = this.players[attackerId].name;
    const defenderOwner = to.owner;
    const defenderName = defenderOwner ? this.players[defenderOwner]?.name : 'personne';

    if (!to.owner || to.soldiers === 0) {
      // Empty territory
      from.soldiers -= amount;
      to.owner = attackerId;
      to.soldiers = amount;
      this.addLog(`⚔️ ${attackerName} capture ${TERRITORIES[toId].name} (territoire vide).`);
    } else {
      const defenders = to.soldiers;
      const result = amount - defenders;

      if (result > 0) {
        // Attacker wins
        from.soldiers -= amount;
        to.owner = attackerId;
        to.soldiers = result;
        this.addLog(`⚔️ ${attackerName} attaque ${TERRITORIES[toId].name} (${defenderName}) : ${amount} vs ${defenders} → victoire ! ${result} survivant(s).`);
        this.checkPlayerEliminated(defenderOwner);
      } else {
        // Attack fails
        from.soldiers -= amount;
        to.soldiers = Math.max(1, -result + 1);
        this.addLog(`⚔️ ${attackerName} attaque ${TERRITORIES[toId].name} (${defenderName}) : ${amount} vs ${defenders} → échec.`);
      }
    }

    this.checkWinCondition();
    return { ok: true };
  }

  moveTroops(playerId, fromId, toId, amount) {
    if (this.phase !== 'movement' || this.currentPlayer !== playerId)
      return { error: 'Pas ton tour ou mauvaise phase.' };

    const from = this.territories[fromId];
    const to = this.territories[toId];

    if (from.owner !== playerId) return { error: 'Tu ne contrôles pas ce territoire.' };
    if (to.owner !== playerId) return { error: 'Tu ne contrôles pas le territoire de destination.' };
    if (from.soldiers <= amount) return { error: 'Pas assez de soldats (il faut en garder au moins 1).' };

    // Check connectivity within 3 hops (BFS)
    const maxHops = this.activeEvents.some(e => e.effect === 'reduce_movement') ? 1 : 3;
    if (!this.isConnected(playerId, fromId, toId, maxHops))
      return { error: `Ces territoires ne sont pas connectés sur ${maxHops} case(s).` };

    const maxPerTerr = 20;
    if (to.soldiers + amount > maxPerTerr)
      return { error: `Max ${maxPerTerr} soldats par territoire.` };

    const maxMove = this.activeEvents.some(e => e.effect === 'limit_movement') ? 10 : Infinity;
    if (amount > maxMove) return { error: `Vent violent : max ${maxMove} soldats déplacés.` };

    from.soldiers -= amount;
    to.soldiers += amount;

    const player = this.players[playerId];
    this.addLog(`🚶 ${player.name} déplace ${amount} soldat(s) de ${TERRITORIES[fromId].name} vers ${TERRITORIES[toId].name}.`);
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
    
    const entry = { from: fromId, to: toId, message, timestamp: Date.now() };
    this.diplomaticMessages.push(entry);

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
      // End of turn
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
    if (territories.length === 0) {
      const player = this.players[playerId];
      this.addLog(`💀 ${player.name} est éliminé !`);
      this.playerOrder = this.playerOrder.filter(id => id !== playerId);
      if (this.currentPlayerIndex >= this.playerOrder.length) {
        this.currentPlayerIndex = 0;
      }
    }
  }

  checkWinCondition() {
    const totalTerritories = Object.keys(TERRITORIES).length;
    for (const pid of this.playerOrder) {
      const count = this.getPlayerTerritories(pid).length;
      if (count === totalTerritories) {
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
    return Array.from(visible);
  }

  getStateForPlayer(playerId) {
    const visible = new Set(this.getVisibleTerritories(playerId));
    const fogExtended = this.activeEvents.some(e => e.effect === 'fog_extended');

    const territories = {};
    Object.keys(this.territories).forEach(tid => {
      const t = this.territories[tid];
      if (visible.has(tid) && !fogExtended) {
        territories[tid] = { ...t };
      } else if (t.owner === playerId) {
        territories[tid] = { ...t }; // Always see own
      } else {
        territories[tid] = { owner: null, soldiers: 0, hidden: true };
      }
    });

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
      log: this.log.slice(-30),
      winner: this.winner,
      myMessages: messages,
      myGold: this.players[playerId]?.gold || 0,
    };
  }

  addLog(msg) {
    const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    this.log.push(`[${time}] ${msg}`);
    if (this.log.length > 100) this.log.shift();
  }

  getFullState() {
    return {
      phase: this.phase,
      turn: this.turn,
      currentPlayer: this.currentPlayer,
      players: this.players,
      playerOrder: this.playerOrder,
      territories: this.territories,
      activeEvents: this.activeEvents,
      deploymentLeft: this.deploymentLeft,
      log: this.log.slice(-30),
      winner: this.winner,
    };
  }
}

module.exports = { GameEngine };
