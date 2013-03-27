/**
 * Copyright 2013 Michael N. Gagnon
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Instead of using D3 selectAll, just do D3 select(node) for a given node
 * reference.
 */

function directionToAngle(direction) {
  if (direction == Direction.UP) {
    return 0
  } else if (direction == Direction.DOWN) {
    return 180
  } else if (direction == Direction.LEFT) {
    return -90
  } else if (direction == Direction.RIGHT) {
    return 90
  } else {
    // assert false
  }
}

function botTransform(x, y, facing) {
  return "translate(" + x + ", " + y + ") " +
    "rotate(" + directionToAngle(facing) + " 16 16)"
}

function nonBotAnimate() {
  // TODO: animate coins rotating or something
  // IDEA: perhaps the reason nonBotAnimate and animateCoinCollection were
  // interferring is because they were both operating on the same svg elements
  // but they were using different transition objects.
}

function animateCoinCollection(coins, bots) {

  // need to serialize coin objects as strings so they can be used as keys
  // in the collectedCoins object
  function serial(coin) {
    return coin.x + "x" + coin.y
  }

  // TODO: how can I simply get collectedCoins.length?
  var numCollected = 0

  // object "x,y" keys for each coin being collected
  var collectedCoins = _(bots)
    .map( function(b) {
      if ("coin_collect" in b.animations) {
        numCollected += 1
        return serial(b.animations.coin_collect)
      } else {
        return null
      }
    })
    .compact()
    .object([])
    .value()

  if (numCollected > 0) {

    var trans = d3.selectAll(".coin").data(coins).transition()

    trans
      .filter( function(coin) {
        return serial(coin) in collectedCoins
      })
      .attr("r", COIN_EXPLODE_RADIUS)
      .attr("opacity", "0.0")
      .delay(ANIMATION_DUR / 4)
      .ease("cubic")
      .duration(ANIMATION_DUR)
  }
}

function animateFailMove(transition) {
  var MOVE_DEPTH = 6
  transition
  .filter( function(bot) {
    return "failMove" in bot.animations
  })
  .attr("transform", function(bot) {
    var animation = bot.animations.failMove
    var dx = 0
    var dy = 0
    if (bot.cellX != animation.destX) {
      dx = (animation.destX - bot.cellX) * MOVE_DEPTH
    }
    if (bot.cellY != animation.destY) {
      dy = (animation.destY - bot.cellY) * MOVE_DEPTH
    }
    var x = bot.cellX * CELL_SIZE + dx
    var y = bot.cellY * CELL_SIZE + dy
    return botTransform(x, y, bot.facing)
  })
  .ease("cubic")
  .duration(ANIMATION_DUR / 2)
  .each("end", function() {
    d3.select(this).transition() 
      .attr("transform", function(bot) {
        var x = bot.cellX * CELL_SIZE
        var y = bot.cellY * CELL_SIZE 
        return botTransform(x, y, bot.facing)
      })
  })
  .ease(EASING)
  .duration(ANIMATION_DUR / 2)
}

function animateRotate(transition) {
  transition.filter( function(bot) {
    return "rotate" in bot.animations
  })
  .attr("transform", function(bot) {
    var x = bot.cellX * CELL_SIZE
    var y = bot.cellY * CELL_SIZE
    return botTransform(x, y, bot.facing)
  })
  .ease(EASING)
  .duration(ANIMATION_DUR)
}

function animateMoveNonTorus(transition) {
  transition.filter( function(bot) {
    return "move" in bot.animations && !bot.animations.move.torus
  })
  .attr("transform", function(bot) {
    var x = bot.cellX * CELL_SIZE
    var y = bot.cellY * CELL_SIZE
    return botTransform(x, y, bot.facing)
  })
  .ease(EASING)
  .duration(ANIMATION_DUR)
}

function isTorusBot(bot) {
  return "move" in bot.animations && bot.animations.move.torus
}

function animateMoveTorus(transition, bots) {

  /**
   * Replace the svg-bot element with a clone, and move the original bot
   * across the screen (out of bounds). Then move both svg elements at the
   * same time.
   */

  torusBots = bots.filter( function(bot) {
    return isTorusBot(bot)
  })

  // create the clone of the bot
  VIS.selectAll(".botClone")
    .data(torusBots)
    .enter().append("svg:use")
    .attr("class", "bot")
    .attr("xlink:href", "#botTemplate")
    .attr("transform", function(bot) {
      var x = bot.animations.move.prevX * CELL_SIZE
      var y = bot.animations.move.prevY * CELL_SIZE
      return botTransform(x, y, bot.facing)
    })
    .transition()
    .attr("transform", function(bot) {
      var x = bot.animations.move.oobNextX * CELL_SIZE
      var y = bot.animations.move.oobNextY * CELL_SIZE
      return botTransform(x, y, bot.facing)
    })
    .ease(EASING)
    .duration(ANIMATION_DUR)
    .each("end", function() {
      // garbage collect the bot clones
      d3.select(this).remove()
    })

  // instantly move the bot across to the other side of the screen
  transition.filter( function(bot) {
      return isTorusBot(bot)
    })
    .attr("transform", function(bot) {
      var x = bot.animations.move.oobPrevX * CELL_SIZE
      var y = bot.animations.move.oobPrevY * CELL_SIZE
      return botTransform(x, y, bot.facing)
    })
    .ease(EASING)
    .duration(0)
    .each("end", function() {
      // once the bot is on the other side of the screen, move it like normal
      d3.select(this).transition() 
        .attr("transform", function(bot) {
          var x = bot.cellX * CELL_SIZE
          var y = bot.cellY * CELL_SIZE
          return botTransform(x, y, bot.facing)
        })
        .ease(EASING)
        .duration(ANIMATION_DUR)
    })

}

// TODO: breakup into smaller functions
function animate() {
  if (PLAY_STATUS == PlayStatus.PAUSED) {
    return;
  }

  // advance the simulation by one "step"
  step(BOARD.bots)

  // must pass initCoins for d3 transitions to work. Since the svg-coin
  // elements are never removed from the board (until the simulation ends)
  // the d3 transition must operate on BOARD.initCoins, not BOARD.coins
  animateCoinCollection(BOARD.initCoins, BOARD.bots)

  var transition = d3.selectAll(".bot").data(BOARD.bots).transition()

  animateFailMove(transition)
  animateRotate(transition)
  animateMoveNonTorus(transition)
  animateMoveTorus(transition, BOARD.bots)
}

function cleanUpVisualization() {
  d3.selectAll(".bot").remove()
  d3.selectAll(".coin").remove()
  d3.selectAll(".botClone").remove()
  d3.selectAll(".block").remove()
}
 
function createBoard() {
  VIS = d3.select("#board")
    .attr("class", "vis")
    .attr("width", NUM_COLS * CELL_SIZE)
    .attr("height", NUM_ROWS * CELL_SIZE)
}

function drawCells() {

  var cells = new Array()
  for (var x = 0; x < NUM_COLS; x++) {
    for (var y = 0 ; y < NUM_ROWS; y++) {
      cells.push({'x': x, 'y': y })
    }
  }

  VIS.selectAll(".cell")
    .data(cells)
    .enter().append("svg:rect")
    .attr("class", "cell")
    .attr("stroke", "lightgray")
    .attr("fill", "white")
    .attr("x", function(d) { return d.x * CELL_SIZE })
    .attr("y", function(d) { return d.y * CELL_SIZE })
    .attr("width", CELL_SIZE)
    .attr("height", CELL_SIZE)

 }

function drawCoins() {
  VIS.selectAll(".coin")
    .data(BOARD.coins)
    .enter().append("svg:circle")
    .attr("class", "coin")
    .attr("stroke", "goldenrod")
    .attr("fill", "gold")
    .attr("opacity", "1.0")
    .attr("r", COIN_RADIUS)
    .attr("cx", function(d){ return d.x * CELL_SIZE + CELL_SIZE/2 } )
    .attr("cy", function(d){ return d.y * CELL_SIZE + CELL_SIZE/2} )
}

function drawBlocks() {
  VIS.selectAll(".block")
    .data(BOARD.blocks)
    .enter().append("svg:rect")
    .attr("class", "block")
    .attr("stroke", "darkgray")
    .attr("fill", "darkgray")
    .attr("width", CELL_SIZE)
    .attr("height", CELL_SIZE)
    .attr("x", function(d){ return d.x * CELL_SIZE } )
    .attr("y", function(d){ return d.y * CELL_SIZE } )
}

function drawBots() {
  VIS.selectAll(".bot")
    .data(BOARD.bots)
    .enter().append("svg:use")
    .attr("class", "bot")
    .attr("xlink:href", "#botTemplate")
    .attr("transform", function(bot) {
      var x = bot.cellX * CELL_SIZE
      var y = bot.cellY * CELL_SIZE
      return botTransform(x, y, bot.facing)
    })
}
