var game = (function(){
	var pieces;
	var states;
	var actions;
	var moves;

	//Создать карту
	var createMap = function () {
		var map = [];
		for (var x = 1; x <= 8; x++) {
			map[x] = [];
			for (var y = 1; y <= 8; y++) {
				map[x][y] = {}
				map[x][y].empty = true;
				map[x][y].x = x;
				map[x][y].y = y;	
			}
		}
		var notCaptured = pieces.get({captured:false});
			for (var i = 0; i < notCaptured.length; i++) {
				var p = notCaptured[i];
				var cell = map[p.pos.x][p.pos.y];
				cell.empty = false;
				cell.player = p.player;//!
				cell.piece = p;
		}

		return map;
	};

	//Возвращает противоположного игрока
	var enemyPlayer = function(player) {
		if ((player != 'string') && (typeof states.current != 'undefined'))
			player = states.current.player || 'white';
		return player == 'white' ? 'black' : 'white';
	};

	/*  Функция создаёт стейт. 
		Определена в game чтобы можно было создавать стейты вне машины */
	var State = function(player, start, end) {
		this.player = 'white';
		this.start = [];
		this.end = [];
		if (typeof player == 'string')
			this.player = player;
		if (typeof start == 'object')
			this.start = start;
		if (typeof end == 'object')
			this.end = end;
	};

	//Функции которые можно будет вызвать у любого стейта так: state.function()
	State.prototype = {
		change: function (reverse) {
			var start = this.start;
			var end = this.end;
			var items = this.end; //Ключи которые нужно перебирать
			if (reverse)
				end = this.start;

			for (var i = 0; i < items.length; i++)
				for (key in items[i])
					pieces.all[start[i].id][key] = end[i][key];

		},
		apply: function() {
			this.change();
		},
		rollBack: function() {
			this.change(true);
		}
	};

	//Машина стейтов
	var states = (function() {
		var data = [];
		var count = 0; //Единый счётчик стейтов (пока что для всего даже дерева)

		//Конструктора дерева стейтов
		var StatesTree = function() {
			this.states = [];
			this.links = [];
		};

		StatesTree.prototype = {
			add: function(state) {
				if (typeof state.id != 'number')
					return;
				if (typeof this.states[state.id] == 'undefined') {
					this.states[state.id] = state;
				}
				else 
					return this.states[state.id]; //Вернём то, что там лежит (возможно произошла ошибка)
			},
			//Добавляет ссылку на стейт link в state
			link: function (state, link) {
				var id = state.id;
				if (typeof state == 'number')
					id = state;
				if (typeof id != 'number')
					return;
				if (typeof link == 'number')
					link = this.states[link];
				if (typeof link != 'object')
					return;

				if (typeof this.links[id] != 'undefined') {
					if (this.links[id].indexOf(link) < 0)
						this.links[id].push(link);
				}
				else {
					this.links[id] = [];
					this.links[id].push(link);
				}

				return state;
			}
		};

		// Oбъект states
		var object = {};
		//Создаём states.tree
		object.tree = new StatesTree();

		object.add = function(state) {
			if (typeof state == 'undefined')
				return;

			state.id = count++;

			data.push(state);

			return state;
		};
		object.next = function(nextState) {
			if (typeof nextState == 'number')
				nextState = data[nextState];

			if (typeof nextState != 'object') {
				nextState = this.current.next;
				if (typeof nextState != 'object')
					return;
			}

			this.current.next = nextState;
			var previous = this.current;
			this.current = this.current.next;
			this.current.previous = previous;

			if (typeof this.current.id == 'undefined') {
				this.add(this.current);
				this.tree.add(this.current);
				this.tree.link(this.current.previous, this.current);
			}
		};
		object.back = function() {
			if (typeof this.current.previous != 'object')
					return; //Значит дошли до начала

			var nextState = this.current;
			this.current = this.current.previous;
			this.current.next = nextState;
		};

		return object;
	})();//Закончилась машина стейтов

	//Объект генерирует задания для сцены
	var actions = {
		create: function(state, reverse) {
			if (typeof state == 'undefined')
				state = states.current;

			var start = state.start;
			var end = state.end;
			var items = state.end;
			if (reverse)
				end = state.start;
			
			var actions = [];
			for (var i = 0; i < items.length; i++) {
				for (k in items[i]) {
					switch (k) {
						case 'pos':
							actions.push({
								task:"move",
								id: start[i].id,
								x: end[i].pos.x,
								y: end[i].pos.y,
							});
							break;
						case 'captured':
							if (end[i].captured)
								actions.push({
									task:"capture",
									id: start[i].id
								});
							else
								actions.push({
									task:"release",
									id: start[i].id,
									x: start[i].pos.x,
									y: start[i].pos.y
								});
							break;
						case 'type':
							actions.push({
								task:"setType",
								id: start[i].id,
								type: end[i].type
							});
						case 'passant':
							if (end[i].passant)
								actions.push({
									task:"onPassant",
									id: start[i].id
								});
							else
								actions.push({
									task:"offPassant",
									id: start[i].id
								});										
							break;
						default:
							break;
					}
				}
			}

			return actions;
		}
	};

	//Объект хранит доступные перемещения для фигур
	var moves = {
		data:[],
		forPiece:[],
		next: {
			pieces:[],
			params:[]
		},
		clear: function() {
			this.data = [];
			this.forPiece = [];
			delete this.last;
		}
	}

	//Конструктор фигуры
	var Piece = function(piece) {
		if (typeof piece == 'object')
			for (var key in piece)
				this[key] = piece[key];
		if (typeof this.captured === 'undefined')
				this.captured = false;
		if (this.type == 'king') {//Подумать как это переписать
			var castling = this.castling || {};
			this.castling = {};
			this.castling.long = typeof castling.long == "undefined" ? true : castling.long;
			this.castling.short = typeof castling.short == "undefined" ? true : castling.short;
		}
	};

	var move;//Массив функций для рассчёта ходов фигур

	Piece.prototype = {
		allowedMoves: function(map, player) {
			if (typeof map == 'string') {
				player = map;
				map = undefined;
			}
			if (typeof map == 'undefined')
				map = createMap();
			return move[this.type](map, this, player);
		},
		copy: function() {
			return new Piece(this);
		}
	};

	move = {
		knight: function(map, piece, currentPlayer) {
			var allowed = [];
			var player = piece.player;
				
			if (typeof currentPlayer === 'undefined')
				currentPlayer = player;
					
			var x = piece.pos.x;
			var y = piece.pos.y;
			var offset = [-2, -1, 2, 1];
			for (var i = 0; i < offset.length; i++) {
				var ox = offset[i]; // offset for x from -2 to 2
				var oy = offset[3 - i]; // offset for y from 2 to -2

				if ((x + ox <= 8) && (x + ox >= 1)) {
					if ((y + oy <= 8) && (y + oy >= 1) && 
						((map[x + ox][y + oy].player !== player) || 
						(player !== currentPlayer) ||
						map[x + ox][y + oy].empty)) {	

						map[x + ox][y + oy].allowed = true;
						allowed.push(map[x + ox][y + oy]);
					}
					if ((y - oy <= 8) && (y - oy >= 1) && 
						((map[x + ox][y - oy].player !== player) || 
						(player !== currentPlayer) ||	
						map[x + ox][y - oy].empty)) {

						map[x + ox][y - oy].allowed = true;
						allowed.push(map[x + ox][y - oy]);
					}
				}
			}
								
			//x1 = offset[i], x2 = offset[3 - i];
			//i = 0; x1 = -2, x2 = 1;
			//i = 1; x1 = -1, x2 = 2;
			//i = 2; x1 = 2, x2 = -1;							
			//i = 3; x1 = 1, x2 = -2;
			return allowed;
		},
		rook: function(map, piece, currentPlayer) {
			var player = piece.player;
			if (typeof currentPlayer === 'undefined')
				currentPlayer = player;

			var allowed = [];
			for (var d = -1; d <= 1; d += 2) {
				var x = piece.pos.x + d;
				var y = piece.pos.y;
				while ((x >= 1) && (x <= 8)) {
					if (map[x][y].empty) {
						map[x][y].allowed = true;
						allowed.push(map[x][y]);
					}
					else {
						if ((map[x][y].player !== player) || 
							(player !== currentPlayer)) {
							map[x][y].allowed = true;
							allowed.push(map[x][y])
								
							if ((map[x][y].piece.type === 'king') && 
								(player !== currentPlayer)) {
								x += d;
								continue;
							}
						}
						break;
					}
					x += d;
				}
			}

			for (var d = -1; d <= 1; d += 2) {
				var x = piece.pos.x;
				var y = piece.pos.y + d;
				while ((y >= 1) && (y <= 8)) {
					if (map[x][y].empty === true) {
						map[x][y].allowed = true;
						allowed.push(map[x][y])
					}
					else {
						if ((map[x][y].player !== player) || 
							(player !== currentPlayer)) {
							map[x][y].allowed = true;
							allowed.push(map[x][y]);
								
							if ((map[x][y].piece.type === 'king') && 
								(player !== currentPlayer)) {
								y += d;
								continue;
							}
						}
						break;
					}
					y += d;
				}
			}
			return allowed;
		},
		bishop: function (map, piece, currentPlayer) {
			var player = piece.player;
			if (typeof currentPlayer === 'undefined')
				currentPlayer = player;

			var allowed = [];
				
			for (var dx = -1; dx <= 1; dx += 2) {
				for (var dy = -1; dy <= 1; dy += 2) {
					var x = piece.pos.x + dx;
					var y = piece.pos.y + dy;
					while ((x >= 1) && (x <= 8) && (y >= 1) && (y <= 8)) {
						if (map[x][y].empty) {
							map[x][y].allowed = true;
							allowed.push(map[x][y])
						}
						else {
							if ((map[x][y].player !== player) ||
								(player !== currentPlayer)) {
								map[x][y].allowed = true;
								allowed.push(map[x][y])

								if ((map[x][y].piece.type === 'king') && 
									(player !== currentPlayer)) {
									x += dx;
									y += dy;
									continue;
								}
							}
							break;
						}
						x += dx;
						y += dy;
					}
				}
			}	
			return allowed;
		},
		queen: function (map, piece, currentPlayer) {
			return this.rook(map, piece, currentPlayer)
					.concat(this.bishop(map, piece, currentPlayer));		
		},
		pawn: function (map, piece, currentPlayer) {
			var x = piece.pos.x;
			var y = piece.pos.y;
						
			var player = piece.player;
			if (typeof currentPlayer === 'undefined')
				currentPlayer = player;

			var allowed = [];
						
			var oy;
			if (player === "white")
				oy = 1;
			else
				oy = -1;
						
			if ((y + oy >= 1) && (y + oy <= 8)) {
				if (map[x][y + oy].empty &&
					(player === currentPlayer)) {
					map[x][y + oy].allowed = true;

					if ((y + oy === 8) || (y + oy === 1)) {//for promotion
						map[x][y + oy].promoted = true;
					}
						
					allowed.push(map[x][y + oy])
							
					if (((2 * y) === (9 - oy * 5)) && 
						(map[x][y + oy * 2].empty)) {
						map[x][y + oy * 2].allowed = true;
						map[x][y + oy * 2].passant = true;
						allowed.push(map[x][y + oy * 2]);
					}
				}

				for (var dx = -1; dx <= 1; dx += 2) {
					if ((x + dx >= 1) && (x + dx <= 8)){
						if ((y + oy === 8) || (y + oy === 1)) {//for promotion
							map[x + dx][y + oy].promoted = true;
						}
						if ((!map[x + dx][y + oy].empty &&
						 	(map[x + dx][y + oy].player !== player)) || 
							(player !== currentPlayer)) {//For king controll
							map[x + dx][y + oy].allowed = true;
							allowed.push(map[x + dx][y + oy]);
						}
						if ((map[x + dx][y].empty !== true) &&
							(map[x + dx][y].player !== player) &&
							(map[x + dx][y].piece.type === 'pawn') &&
							(map[x + dx][y].piece.passant)) {//For en passant
							map[x + dx][y + oy].allowed = true;
							map[x + dx][y + oy].special = true;
							map[x + dx][y + oy].piece = map[x + dx][y].piece;
							allowed.push(map[x + dx][y + oy]);
						}
					}
				}
			}
			return allowed;
		},
		king: function(map, piece, currentPlayer) {//TODO disable 0,0 point
			var amap = createMap();

			var player = piece.player;
			if (typeof currentPlayer === 'undefined')
				currentPlayer = player;

			var allowed = [];
						
			if (currentPlayer === player) {
				var enemy = enemyPlayer(); //don't find tuth in states...
				var enemyPieces = pieces.get({player:enemy, captured:false});
				for (var i = 0; i < enemyPieces.length; i++) {
					this[enemyPieces[i].type](amap, enemyPieces[i], currentPlayer);
				}

				var flag = true;
				for (var d = 5; d <= 8; d++) 
					if (amap[d][piece.pos.y].allowed) {
						flag = false;
						break;
					}

				if ((!amap[6][piece.pos.y].empty) || 
					(!amap[7][piece.pos.y].empty) || 
					(!piece.castling.short))
					flag = false;

				if (flag) {
					map[7][piece.pos.y].allowed = true;
					map[7][piece.pos.y].special = true;
					map[7][piece.pos.y].piece = map[8][piece.pos.y].piece;
					allowed.push(map[7][piece.pos.y]);
				}

				flag = true;
				for (var d = 5; d >= 1; d--) 
					if (amap[d][piece.pos.y].allowed) {
							flag = false;
						break;
					}

				if ((!amap[2][piece.pos.y].empty) || 
					(!amap[3][piece.pos.y].empty) || 
					(!amap[4][piece.pos.y].empty) ||
					(!piece.castling.long))
					flag = false;

				if (flag) {
					map[3][piece.pos.y].allowed = true;
					map[3][piece.pos.y].special = true;
					map[3][piece.pos.y].piece = map[1][piece.pos.y].piece;
					allowed.push(map[3][piece.pos.y]);
				}
			}

			for (var dx = -1; dx <= 1; dx++) {
				for (var dy = -1; dy <= 1; dy++) {
					var x = piece.pos.x + dx;
					var y = piece.pos.y + dy;
					if ((x >= 1) && (x <= 8) && 
						(y >= 1) && (y <= 8)) {
						if (((amap[x][y].empty) || 
							(amap[x][y].player !== player)) &&
							 (!amap[x][y].allowed)) {
							map[x][y].allowed = true;
							allowed.push(map[x][y]);
						}
					}
				}
			}

			return allowed;
		}
	};

	//Объект хранит все фигуры
	var pieces = (function(){
		var data = []; //Содержит все фигуры

		//Возвращаем объект pieces
		return {
			all:data,
			add: function(piece) {
				piece.id = this.all.length;
				this.all.push(piece);
				return piece;
			},
			copy: function() {
				var copy = [];
				for (var i = 0; i < this.all.length; i++)
					copy.push(new Piece(this.all[i]));
				return copy;
			},
			protect: function() {
				var copy = this.copy();
				this.all = copy;
			},
			restore: function() {
				this.all = data;
			},
			isProtected: function() {
				return (this.all !== data);
			},
			get: function(params, count) {
				var ret = this.all;
				if (typeof params === 'undefined')
					return ret;
				for (key in params) {
					switch (key) {
						case 'player':
							if (params[key] === 'enemy')
								params[key] = enemyPlayer();
								if (params[key] === 'player')
									params[key] = states.current.player;
								if (!params[key])
									break;
						case 'type':
						case 'captured':
						case 'passant':
							ret = ret.filter(function(el) {
								return params[key] === el[key];
							});
							break;
						case 'pos':
							ret = ret.filter(function(el) {
								if (typeof params[key].x === 'undefined')
									return params[key].y === el[key].y;
								if (typeof params[key].y === 'undefined')
									return params[key].x === el[key].x;
								return ((params[key].x === el[key].x) &&
										(params[key].y === el[key].y));
							});
							break;
						default:
							break;
						}
					}
	
					if (typeof count !== 'undefined')
						if (count === 1)
							return ret[0];
						else
							return ret.slice(0, count);
				return ret;
			}
		};
	})();//Закончились фигуры

	//Создаёт список возможных перемещений фигуры и задачи для сцены 
	var calcPieceMovs = function(id) {
		var piece = pieces.all[id].copy();
		var map = createMap();
		var move = [];
		var actions = [];

		var allowed = piece.allowedMoves(map);

		for (var i = 0; i < allowed.length; i++) {
			var cell = {};
			cell.id = move.length;
			cell.pieces = [];
			cell.params = [];

			cell.pieces.push(piece);
			cell.params.push({pos: {x:allowed[i].x, y:allowed[i].y}});
			actions.push({task: 'allow', id:cell.id, 
				x:allowed[i].x, y:allowed[i].y
			});
							
			if ((typeof allowed[i].piece !== 'undefined') && 
				(allowed[i].piece.player !== piece.player)) {//also fits for passant
				cell.pieces.push(allowed[i].piece.copy());
				cell.params.push({captured:true});
			}
			else {
				if (allowed[i].special) {
					cell.pieces.push(allowed[i].piece.copy());
					var d = piece.pos.x - allowed[i].x;
					if (d > 1) {//for long castling
						cell.params.push({pos: {x: 4, y: piece.pos.y}});
					}
					else //for short castling
						cell.params.push({pos: {x: 6, y: piece.pos.y}});
				}
			if (allowed[i].passant)
					cell.params[0].passant = true;
			}
			if (allowed[i].promoted) {
				cell.params[0].promoted = true;
				actions.push({task:'promote', id:cell.id, 
					x:allowed[i].x, y:allowed[i].y});
			}
			move.push(cell);
		}

		return {move:move,actions:actions};
	};

	//Функции проверки на шах и на мат
	var check = function(player) {
		var map = createMap();
		
		var enemyPieces = pieces.get({player:enemyPlayer(player), captured:false});
		var king = pieces.get({player:player, type:'king'}, 1);

		for (var i = 0; i < enemyPieces.length; i++) {
			enemyPieces[i].allowedMoves(map, player);
			if (map[king.pos.x][king.pos.y].allowed)
				return true;
		}
		
		return false;
	};

	var checkmate = function(player) {
		var playerPieces = pieces.get({player:player, captured:false});
		var king = pieces.get({player:player, type:'king'}, 1);

		for (var i = 0; i < playerPieces.length; i++)
			game.getPieceMovs(playerPieces[i].id);

		if (moves.forPiece[king.id].length > 0)
			return false;

		for (var i = 0; i < moves.data.length; i++) {
			for (var m = 0; m < moves.data[i].move.length; m++) {
				pieces.protect();
				for (var j = 0; j < moves.data[i].move[m].pieces.length; j++) {
					var piece = moves.data[i].move[m].pieces[j];
					var param = moves.data[i].move[m].params[j];
					for (var key in param)
						pieces.all[piece.id][key] = param[key];
				}

				if (!check(player)) {
					pieces.restore();
					return false;
				}

				pieces.restore();
			}
		}
		
		return true;
	}

	//Возвращаем game
	return {
		debug: {states:states, pieces:pieces, moves:moves,calc:calcPieceMovs, actions:actions},
		new: function (params) {
			if (typeof params != 'undefined')
				if (typeof params.pieces != 'undefined')
					for (var i = 0; i < params.pieces.length; i++)
						pieces.add(new Piece(params.pieces[i]));


			states.current = new State(enemyPlayer());
			states.add(states.current);
			states.tree.add(states.current);

			this.getCurrentState = function() {return states.current;}

 			Object.preventExtensions(this);
		},
		ply: function (params) {
			if ((typeof params === 'undefined') ||
				(typeof params.id === 'undefined') ||
				(typeof moves.last === 'undefined'))
				return [];

			var move = moves.last.move[params.id];
			if (typeof move === 'undefined')
				return [];

			if (moves.hasNext) {//to do some from previous state	
				move.pieces = move.pieces.concat(moves.next.pieces);
				move.params = move.params.concat(moves.next.params);
				//TODO сделать чтобы корректно работало в состоянии шаха!
				moves.hasNext = false;
				moves.next.pieces = [];
				moves.next.params = [];
			}

			var king = pieces.get({player:'player', type:'king'}, 1);		
			
			switch (move.pieces[0].type) {//todo rename movs params to fit states
				case 'pawn':
					if (move.params[0].passant) {
						var piece = move.pieces[0].copy();
						piece.passant = true;
						moves.hasNext = true;
						moves.next.pieces.push(piece);
						moves.next.params.push({passant: false});
					}
					if (move.params[0].promoted) {
						if ((typeof params.type !== 'undefined') && 
							(promotionAllowedTypes.lastIndexOf(params.type) > -1))
							move.params[0].type = params.type;
						else
							return [];
					}
					break;
				case 'rook':
					if (king.castling.short || king.castling.long) {
						move.pieces.push(king.copy());
						var castling = king.copy().castling;
						if (move.pieces[0].pos.x === 1) {
							castling.long = false;
							move.params.push({castling:castling});
							break;
						}
						if (move.pieces[0].pos.x === 8) {
							castling.short = false;
							move.params.push({castling:castling});
							break;
						}
						castling.short = false;
						castling.long = false;
						move.params.push({castling:castling});
					}
					break;
				case 'king':
					if (move.pieces[0].castling.short || move.pieces[0].castling.long) {
						move.params[0].castling = {};
						move.params[0].castling.long = false;
						move.params[0].castling.short = false;
					}
				default:
					break;
			}

			states.current.start = move.pieces;
			states.current.end = move.params;

			states.current.apply();
			//states.next();//Переход хода совершён.

			//Проверка на шах
			var sceneActions = [];
			if (check(states.current.player)) {
				states.current.rollBack();//Return back changes
			
				if (check(states.current.player)) {
					if (checkmate(states.current.player))
						sceneActions.push({task:'message', type:'info', text:'checkmate!'});
					else
						sceneActions.push({task:'message', type:'info', text:'Check!'});
				}

				return sceneActions;
			}

			sceneActions = actions.create();

			states.next(new State(enemyPlayer()));
			moves.clear();

			return sceneActions;
		},
		getPieceMovs: function(id) {
			if (pieces.all[id].player !== states.current.player)
				return [];
			if (pieces.all[id].captured)
				return [{task:'capture', id: id}];//HOTFIX!

			if (typeof moves.forPiece[id] === 'undefined') {	
				var move = calcPieceMovs(id);
				moves.data.push(move);
				moves.forPiece[id] = move;
			}

			moves.last = moves.forPiece[id];

			return moves.last.actions;
		},
		getPieces: function() {
			return pieces.copy();
		},
		goBack: function() {
			//states.current.rollBack(); Не нужно - ход либо совершён либо нет
			moves.clear();
			states.back();
			var sceneActions = actions.create(states.current, true);
			states.current.rollBack();
			return sceneActions;
		},
		goNext: function() {
			states.current.apply();
			moves.clear();
			var sceneActions = actions.create(states.current, false);
			states.next();
			return sceneActions;
		}
	};
})();//Закончился game

