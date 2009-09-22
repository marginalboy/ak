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
  var base = ak.include('base.js');
  var map = ak.include('map.js');
  var debug = ak.include('debug.js');
  var http = ak.include('http.js');

  var $ = base.module('ak.url');


  $.ResolveError = base.makeErrorClass(http.NotFoundError);
  $.ReverseError = base.makeErrorClass();


  function makePutByRegExp(re) {
    var string = re.source;
    var start = string.indexOf('(');
    var stop = string.lastIndexOf(')');
    if (start == -1 || stop == -1 || start > stop)
      return function (x) { return x + ''; };
    var prefix = string.substring(0, start).replace(/\\(.)/, '$1');
    var suffix = string.substring(stop + 1).replace(/\\(.)/, '$1');
    return function (x) { return prefix + x + suffix; };
  }


  var defaultPattern = /([^\/]*)\//;


  $.Route = base.makeClass(
    function (/* [pattern,] [controller,] [put,] [children] */) {
      if (typeof(arguments[0]) == 'string' || arguments[0] instanceof RegExp)
        this._pattern = Array.shift(arguments);
      else
        this._pattern = defaultPattern;
      if (typeof(arguments[0]) == 'function')
        this._controller = Array.shift(arguments);
      if (typeof(this._pattern) != 'string')
        this._put = (typeof(arguments[0]) == 'function'
                     ? Array.shift(arguments)
                     : (this._pattern === defaultPattern
                        ? function (x) { return x + '/'; } // optimization
                        : makePutByRegExp(this._pattern)));
      this._children = [];
      if (arguments[0] instanceof Array)
        Array.shift(arguments).forEach(this._addChild, this);
      if (arguments.length)
        throw new Error(base.repr(arguments.callee) +
                        ' was called with excess or invalid arguments');
    },
    {
      _addChild: function (child) {
        if (!(child instanceof $.Route)) {
          if (child instanceof Array)
            child = base.factory($.Route).apply(base.global, child);
          else
            throw new Error('Route child could be either Route or Array');
        }
        child._parent = this;
        this._children.push(child);
      },

      _resolve: function (path) {
        var match;
        var rest;
        if (typeof(this._pattern) == 'string') {
          if (!path.startsWith(this._pattern))
            return null;
          rest = path.substr(this._pattern.length);
        } else {
          match = this._pattern.exec(path);
          if (!match || match.index != 0)
            return null;
          rest = path.substr(match[0].length);
        }
        var result;
        if (!rest) {
          if (this._controller)
            result = [this._controller, []];
        } else {
          for (var i = 0; i < this._children.length && !result; ++i)
            result = this._children[i]._resolve(rest);
        }
        if (!result)
          return null;
        if (match)
          result[1].unshift(match.length == 1
                            ? match[0]
                            : (match.length == 2
                               ? match[1]
                               : match.slice(1)));
        return result;
      },

      resolve: function (path) {
        var result = this._resolve(path);
        if (!result)
          throw new $.ResolveError('Can not resolve path "' + path + '"');
        return result;
      },

      _populate: function (map, count) {
        if (typeof(this._pattern) != 'string')
          ++count;
        if (this._controller) {
          var dict = map.setDefault(this._controller, {});
          dict[count] = count in dict ? null : this;
        }
        this._children.forEach(
          function (child) {
            child._populate(map, count);
          });
      },

      _climb: function (root, args, parts) {
        parts.unshift(typeof(this._pattern) == 'string'
                      ? this._pattern
                      : this._put.call(base.global, args.pop()));
        if (this == root)
          debug.assertEqual(args, []);
        else
          this._parent._climb(root, args, parts);
      },

      // NB this function DOES NOT CHECK path parts to correspond
      // their regular expressions
      reverse: function (controller/* args... */) {
        if (!this._reverseMap) {
          this._reverseMap = new map.Map();
          this._populate(this._reverseMap, 0);
        }
        var dict = this._reverseMap.get(controller);
        if (!dict)
          throw new $.ReverseError(
            'Controller ' + controller + ' is not found');
        var count = arguments.length - 1;
        var route = dict[count];
        if (route === undefined)
          throw new $.ReverseError(
            'Controller ' + controller + ' does not accept ' +
            count + ' arguments');
        if (route === null)
          throw new $.ReverseError(
            'Reverse abibuity for controller ' + controller +
            ' with ' + count + ' arguments');
        var parts = [];
        route._climb(this, Array.slice(arguments, 1), parts);
        return parts.join('');
      }
    });


  $.defineRoutes = function (/* arguments... */) {
    $.root = base.factory($.Route).apply(base.global, arguments);
  };


  $.getRoot = function () {
    if (!$.root)
      throw new Error(base.repr(arguments.callee.caller) +
                      ' requested default routing, please define it using ' +
                      base.repr($.defineRoutes));
    return $.root;
  };


  $.resolve = function (path) {
    return $.getRoot().resolve(path);
  };


  $.prefix = '/' + ak.appName + '/';


  $.reverse = function (/* arguments... */) {
    return ($.prefix +
            encodeURI($.getRoot().reverse.apply($.getRoot(), arguments)));
  };


  base.nameFunctions($);
  return $;
})();
