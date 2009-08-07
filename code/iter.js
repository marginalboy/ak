// Copyright (c) 2009, Anton Korenyushkin
// All rights reserved.

// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//     * Redistributions of source code must retain the above copyright
//       notice, this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//     * Neither the name of the author nor the names of contributors may be
//       used to endorse or promote products derived from this software
//       without specific prior written permission.

// THIS SOFTWARE IS PROVIDED BY THE AUTHOR AND CONTRIBUTORS "AS IS" AND ANY
// EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.

(function ()
{
  include('base.js');
  include('utils.js');

  var base = ak.base;
  var utils = ak.utils;
  var $ = base.module('ak.iter');


  //////////////////////////////////////////////////////////////////////////////
  // Iterator
  //////////////////////////////////////////////////////////////////////////////

  $.Iterator = base.makeClass(
    function () {},
    undefined,
    {
      __repr__: function () {
        return ('<' + (this.valid ? 'valid' : 'invalid') + ' ' +
                this.constructor.__name__ + '>');
      },

      get valid() {
        if (!('_valid' in this))
          throw ReferenceError('valid must be set by Iterator subclass');
        return this._valid;
      },

      set valid(v) {
        this._valid = v;
      },

      next: function () {
        if (!this.valid)
          return undefined;
        return this._next();
      },

      _next: function () {
        throw ReferenceError('_next() must be defined by Iterator subclass');
      }
    });


  $.InvalidIterator = base.makeClass(undefined, $.Iterator, {valid: false});


  //////////////////////////////////////////////////////////////////////////////
  // Free functions
  //////////////////////////////////////////////////////////////////////////////

  $.iter = function (obj) {
    return obj instanceof $.Iterator ? obj : obj.__iterator__();
  };


  $.list = function (iterable) {
    var itr = $.iter(iterable);
    var result = [];
    while (itr.valid)
      result.push(itr.next());
    return result;
  };


  $.advance = function (itr, n) {
    for (var i = 0; i < n && itr.valid; ++i)
      itr.next();
  };


  function findMinOrMax(cmpValue, iterable) {
    var itr = $.iter(iterable);
    if (!itr.valid)
      throw Error((cmpValue == 1 ? 'min' : 'max') + ' argument is empty');
    var result = itr.next();
    while (itr.valid) {
      var value = itr.next();
      if (base.cmp(result, value) == cmpValue)
        result = value;
    }
    return result;
  };


  $.min = base.partial(findMinOrMax, 1);
  $.max = base.partial(findMinOrMax, -1);


  $.reduce = function (func, iterable, /* optional */initial) {
    var itr = $.iter(iterable);
    var result;
    if (arguments.length < 3) {
      if (!itr.valid)
        throw new Error('reduce() of empty sequence with no initial value');
      result = itr.next();
    } else {
      result = initial;
    }
    while (itr.valid)
      result = func(result, itr.next());
    return result;
  };


  $.sum = function (iterable, start/* = 0 */) {
    return $.reduce(base.operators.add, iterable, start || 0);
  };


  $.exhaust = function (iterable) {
    $.advance(iterable, Infinity);
  };


  $.forEach = function (iterable, func) {
    var itr = $.iter(iterable);
    while (itr.valid)
      func(itr.next());
  };


  $.every = function (iterable, pred) {
    // alternative impl:
//     var itr = $.ifilter(iterable, base.compose(base.operators.not, pred));
//     return !itr.valid;
    var itr = $.iter(iterable);
    while (itr.valid)
      if (!pred(itr.next()))
        return false;
    return true;
  };


  $.some = function (iterable, pred) {
    // alternative impl:
//     var itr = $.ifilter(iterable, pred);
//     return itr.valid;
    var itr = $.iter(iterable);
    while (itr.valid)
      if (pred(itr.next()))
        return true;
    return false;
  };


  $.sorted = function (iterable, cmp/* = ak.base.cmp */) {
    var result = $.list(iterable);
    result.sort(cmp || base.cmp);
    return result;
  };


  $.reversed = function (iterable) {
    var result = $.list(iterable);
    result.reverse();
    return result;
  };

  //////////////////////////////////////////////////////////////////////////////
  // Utility iterators
  //////////////////////////////////////////////////////////////////////////////

  $.SliceIterator = base.makeClass(
    function (iterable,
              start/* = 0 */,
              stop /* = Infinity */) {
      this._itr = $.iter(iterable);
      start = start || 0;
      stop = stop || Infinity;
      $.advance(this._itr, start);
      this._count = stop - start;
    },
    $.Iterator,
    {
      get valid() {
        return this._itr.valid && this._count > 0;
      },

      _next: function () {
        --this._count;
        return this._itr.next();
      }
    });

  $.islice = base.factory($.SliceIterator);


  $.CountIterator = base.makeClass(
    function (n) {
      this._n = n || 0;
    },
    $.Iterator,
    {
      __repr__: function () {
        return this.constructor.__name__ + '(' + this._n + ')';
      },

      valid: true,

      _next: function () {
        return this._n++;
      }
    });

  $.count = base.factory($.CountIterator);


  $.CycleIterator = base.makeClass(
    function (iterable) {
      this._itr = $.iter(iterable);
      this.valid = this._itr.valid;
      this._saved = [];
    },
    $.Iterator,
    {
      _next: function () {
        if ('_i' in this || !this._itr.valid) {
          if (!('_i' in this && this._i < this._saved.length))
            this._i = 0;
          return this._saved[this._i++];
        }
        var result = this._itr.next();
        this._saved.push(result);
        return result;
      }
    });

  $.cycle = base.factory($.CycleIterator);


  $.RepeatIterator = base.makeClass(
    function (obj, n/* = Infinity */) {
      this._obj = obj;
      this._i = n === undefined ? Infinity : n;
    },
    $.Iterator,
    {
      get valid() {
        return this._i > 0;
      },

      _next: function () {
        --this._i;
        return this._obj;
      }
    });

  $.repeat = base.factory($.RepeatIterator);


  $.ZipIterator = base.makeClass(
    function (/* iterables... */) {
      this._itrs = Array.map(arguments, $.iter);
    },
    $.Iterator,
    {
      get valid() {
        return this._itrs.every(utils.itemGetter('valid'));
      },

      _next: function () {
        return this._itrs.map(utils.methodCaller('next'));
      }
    });

  $.izip = base.factory($.ZipIterator);


  $.FilterIterator = base.makeClass(
    function (iterable, pred) {
      this._pred = pred || base.operators.truth;
      this._itr = $.iter(iterable);
      this.valid = true;
      arguments.callee.prototype._findNextItem.call(this);
    },
    $.Iterator,
    {
      _findNextItem: function () {
        do {
          if (!this._itr.valid) {
            this.valid = false;
            return;
          }
          this._nextItem = this._itr.next();
        } while (!this._pred(this._nextItem));
      },

      _next: function () {
        var result = this._nextItem;
        this._findNextItem();
        return result;
      }
    });

  $.ifilter = base.factory($.FilterIterator);


  $.MapIterator = base.makeClass(
    function (iterable, func) {
      this._itr = $.iter(iterable);
      this._func = func;
    },
    $.Iterator,
    {
      get valid() {
        return this._itr.valid;
      },

      _next: function () {
        return this._func(this._itr.next());
      }
    });

  $.imap = base.factory($.MapIterator);


  $.ChainIterator = base.makeClass(
    function (/* iterables... */) {
      this._itrs = Array.map(arguments, $.iter);
      arguments.callee.prototype._findValid.call(this);
    },
    $.Iterator,
    {
      _findValid: function () {
        while (this._itrs.length && !this._itrs[0].valid)
          this._itrs.shift();
      },

      get valid() {
        return !!this._itrs.length;
      },

      _next: function () {
        var result = this._itrs[0].next();
        this._findValid();
        return result;
      }
    });

  $.chain = base.factory($.ChainIterator);


  $.TakeWhileIterator = base.makeClass(
    function (iterable, pred) {
      this._itr = $.iter(iterable);
      this._pred = pred;
      this.valid = true;
      arguments.callee.prototype._getNextItem.call(this);
    },
    $.Iterator,
    {
      _getNextItem: function () {
        if (!this._itr.valid) {
          this.valid = false;
          return;
        }
        this._nextItem = this._itr.next();
        if (!this._pred(this._nextItem))
          this.valid = false;
      },

      _next: function () {
        var result = this._nextItem;
        this._getNextItem();
        return result;
      }
    });

  $.takeWhile = base.factory($.TakeWhileIterator);


  $.DropWhileIterator = base.makeClass(
    function (iterable, pred) {
      this._itr = $.iter(iterable);
      while (this._itr.valid) {
        var item = this._itr.next();
        if (!pred(item)) {
          this._first = item;
          break;
        }
      }
    },
    $.Iterator,
    {
      get valid() {
        return '_first' in this || this._itr.valid;
      },

      _next: function () {
        if ('_first' in this) {
          var result = this._first;
          delete this._first;
          return result;
        }
        return this._itr.next();
      }
    });

  $.dropWhile = base.factory($.DropWhileIterator);


  $.TeeIterator = base.makeClass(
    function (ident, sync) {
      sync.pos[ident] = -1;
      this._ident = ident;
      this._sync = sync;
    },
    $.Iterator,
    {
      get valid() {
        return (this._sync.pos[this._ident] != this._sync.max ||
                this._sync.itr.valid);
      },

      _next: function () {
        var sync = this._sync;
        var ident = this._ident;
        var i = sync.pos[ident];
        var result;
        if (i == sync.max) {
          result = sync.itr.next();
          sync.deque.push(result);
          ++sync.max;
        } else {
          result = sync.deque[i - sync.min];
        }
        ++sync.pos[ident];
        if (i == sync.min && $.min(sync.pos) != sync.min) {
          ++sync.min;
          sync.deque.shift();
        }
        return result;
      }
    });


  $.tee = function (iterable, n/* = 2 */) {
    var sync = {
      itr: $.iter(iterable),
      pos: [],
      deque: [],
      max: -1,
      min: -1
    };
    var result = [];
    for (var i = 0; i < (n || 2); ++i)
      result.push(new $.TeeIterator(i, sync));
    return result;
  };


  $.GroupByIterator = base.makeClass(
    function (iterable, keyFunc/* = ak.base.operators.identity */) {
      this._itr = $.iter(iterable);
      this._keyFunc = keyFunc || base.operators.identity;
    },
    $.Iterator,
    {
      get valid() {
        return '_value' in this || this._itr.valid;
      },

      _next: function () {
        if (!('_value' in this)) {
          this._value = this._itr.next();
          this._key = this._keyFunc(this._value);
        }
        var values = [this._value];
        while (this._itr.valid) {
          var value = this._itr.next();
          var key = this._keyFunc(value);
          if (base.cmp(key, this._key)) {
            var result = [this._key, values];
            this._value = value;
            this._key = key;
            return result;
          }
          values.push(value);
        }
        delete this._value;
        return [this._key, values];
      }
    });

  $.groupBy = base.factory($.GroupByIterator);

  //////////////////////////////////////////////////////////////////////////////
  // ObjectIterator
  //////////////////////////////////////////////////////////////////////////////

  $.ObjectIterator = base.makeClass(
    function (obj) {
      this._keyItr = $.iter(base.keys(obj));
      this._obj = obj;
    },
    $.Iterator,
    {
      get valid() {
        return this._keyItr.valid;
      },

      _next: function () {
        var key = this._keyItr.next();
        return [key, this._obj[key]];
      }
    });


  Object.prototype.setNonEnumerable('__iterator__', function () {
                                      return new $.ObjectIterator(this);
                                    });

  //////////////////////////////////////////////////////////////////////////////
  // ArrayIterator
  //////////////////////////////////////////////////////////////////////////////

  $.ArrayIterator = base.makeClass(
    function (array) {
      this._array = array;
      this._i = 0;
    },
    $.Iterator,
    {
      get valid() {
        return this._i < this._array.length;
      },

      _next: function () {
        return this._array[this._i++];
      }
    });


  function makeArrayIterator() { return new $.ArrayIterator(this); };
  Array.prototype.setNonEnumerable('__iterator__', makeArrayIterator);
  String.prototype.setNonEnumerable('__iterator__', makeArrayIterator);
  ak.Query.prototype.setNonEnumerable('__iterator__', makeArrayIterator);

  //////////////////////////////////////////////////////////////////////////////
  // Name module functions
  //////////////////////////////////////////////////////////////////////////////

  base.nameFunctions($);

})();
