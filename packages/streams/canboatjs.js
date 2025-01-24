/*
 * Copyright 2017 Signal K & Fabian Tollenaar <fabian@signalk.org>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const Transform = require('stream').Transform
const FromPgn = require('@canboat/canboatjs').FromPgn
const _ = require('lodash')

function pad2 (number) {
  return number < 10 ? '0' + number : number
}

function CanboatJs(options) {
  Transform.call(this, {
    objectMode: true,
  })

  this.fromPgn = new FromPgn(options)
  const createDebug = options.createDebug || require('debug')
  const debug = createDebug('signalk:streams:canboatjs')

  this.fromPgn.on('warning', (pgn, warning) => {
    debug(`[warning] ${pgn.pgn} ${warning}`)
    options.app.emit(`canboatjs:warning`, warning)
  })

  this.fromPgn.on('error', (pgn, err) => {
    console.error(pgn.input, err.message)
    options.app.emit(`canboatjs:error`, err)
  })

  this.app = options.app
  this.analyzerOutEvent = options.analyzerOutEvent || 'N2KAnalyzerOut'
}

require('util').inherits(CanboatJs, Transform)

CanboatJs.prototype._transform = function (chunk, encoding, done) {
  if (_.isObject(chunk) && chunk.fromFile) {
    const pgnData = this.fromPgn.parse(chunk.data)
    if (pgnData) {
      pgnData.timestamp = new Date(Number(chunk.timestamp)).toISOString()
      this.push(pgnData)
      this.app.emit(this.analyzerOutEvent, pgnData)
    } else {
      this.app.emit('canboatjs:unparsed:object', chunk)
    }
  } else {
    const pgnData = this.fromPgn.parse(chunk)
    if (pgnData) {
      if (pgnData.pgn == 129029 || pgnData.pgn == 129033) {
        let [year, month, day] = pgnData.fields.Date.split('.').map(Number)
        if (year < 2020) {
          // Create a date object from the extracted values
          let date = new Date(Date.UTC(year, month - 1, day))
          // Add 7168 days to the date (1024 weeks)
          date.setDate(date.getDate() + 7168)
          // Update the value with the new date
          pgnData.fields.Date = `${date.getUTCFullYear()}.${pad2(date.getUTCMonth() + 1)}.${pad2(date.getUTCDate())}`
        }
      }
      this.push(pgnData)
      this.app.emit(this.analyzerOutEvent, pgnData)
    } else {
      this.app.emit('canboatjs:unparsed:data', chunk)
    }
  }
  done()
}

module.exports = CanboatJs
