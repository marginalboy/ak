// Copyright (c) 2009-2011, Anton Korenyushkin
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

var core = require('core');

// 'with' is used here in order to ensure that namespaces are used correctly
with (require('index')) {

  // May be this function should be in utils.
  function thrower (error) {
    return function () {
      throw error;
    };
  }

  //////////////////////////////////////////////////////////////////////////////
  // unittest tests
  //////////////////////////////////////////////////////////////////////////////

  exports.UnittestTestCase = TestCase.subclass(
    {
      name: 'unittest',

      testTestResult: function () {
        var tr = new TestResult();
        assert(tr.wasSuccessful());
        tr.startTest(1);
        tr.addSuccess(1);
        assert(tr.wasSuccessful());
        tr.startTest(2);
        tr.addError(2, 'error');
        tr.startTest(3);
        tr.addFailure(3, 'failure');
        assertSame(tr.testsRun, 3);
        assertEqual(tr.errors, [[2, 'error']]);
        assertEqual(tr.failures, [[3, 'failure']]);
        assert(!tr.wasSuccessful());
      },

      testTestCase: function () {
        var tested = false, setUp = false, tearedDown = false;
        var started = 0, stopped = 0;
        var tr = new TestResult();
        tr.startTest = function () { ++started; };
        tr.stopTest = function () { ++stopped; };

        var TC = TestCase.subclass(
          {
            setUp: function () {
              setUp = true;
            },
            tearDown: function () {
              tearedDown = true;
            },
            f: function () {
              tested = true;
            }
          });

        function run(TC) {
          new TC('f').run(tr);
        }


        var tc = new TC('f');
        assertSame(tc.countTestCases(), 1);
        assertSame(tc + '', 'f');
        tc.name = 'test';
        assertSame(repr(tc), '<TestCase f(test)>');

        run(TC);
        assert(tested && setUp && tearedDown);
        tested = setUp = tearedDown = false;

        var BadSetUpTC = TC.subclass({setUp: thrower(1)});
        run(BadSetUpTC);
        assert(!tested && !setUp && !tearedDown);

        var ErrorTC = TC.subclass({f: thrower(2)});
        run(ErrorTC);
        assert(!tested && setUp && tearedDown);
        setUp = tearedDown = false;

        var assertionError = new AssertionError(3);
        var FailureTC = TC.subclass({f: thrower(assertionError)});
        run(FailureTC);
        assert(!tested && setUp && tearedDown);
        setUp = tearedDown = false;

        var BadTearDownTC = TC.subclass({tearDown: thrower(4)});
        run(BadTearDownTC);
        assert(tested && setUp && !tearedDown);

        assertEqual(tr.errors.map(function (error) { return error[1]; }),
                    [1, 2, 4]);
        assertEqual(tr.failures.map(function (failure) { return failure[1]; }),
                    [assertionError]);
        assertSame(started, stopped);
        assertSame(started, 5);
      },

      testTestSuite: function () {
        var TC = TestCase.subclass({f: function () {}, g: function () {}});
        var ts = new TestSuite([new TC('f'), new TC('g')]);
        ts.addTest(new TC('f'));
        assertSame(ts.countTestCases(), 3);
        assertSame(repr(ts), '<TestSuite f, g, f>');
        var tr = new TestResult();
        ts.run(tr);
        assertSame(tr.testsRun, 3);
      },

      testStreamTestResult: function () {
        var stream = new MemTextStream();
        var ttr = new StreamTestResult(stream);
        ttr.startTest('hi');
        ttr.addError();
        ttr.addFailure();
        ttr.addSuccess();
        assertSame(stream.get(), 'hi ERROR\n FAIL\n ok\n');
      },

      testLoadTestSuite: function () {
        var ts = new TestSuite();
        assertSame(loadTestSuite(ts), ts);
        var TC = TestCase.subclass(
          {
            name: 'TC',
            test1: function () {},
            test2: function () {},
            func: function () {},
            test3: 42
          });
        assertSame(repr(loadTestSuite(new TC('test1'))),
                   '<TestSuite test1(TC)>');
        assertSame(repr(loadTestSuite(TC)),
                   '<TestSuite test1(TC), test2(TC)>');
        var m = {
          ts: new TestSuite([new TC('func')]),
          tc: new TC('test1'),
          TC: TC
        };
        assertSame(loadTestSuite(m) + '',
                   'func(TC), test1(TC), test1(TC), test2(TC)');
        assertSame(loadTestSuite([m, new TC('test2')]) + '',
                   'func(TC), test1(TC), test1(TC), test2(TC), test2(TC)');
        assertThrow(TypeError, loadTestSuite, 42);
      },

      testRunTestViaStream: function () {
        var TC = TestCase.subclass(
          {
            name: 'test',
            testOk: function () {},
            testError: thrower(1),
            testAssert: partial(assert, false, 'msg1'),
            testAssertEqual: partial(assertEqual, 1, 2, 'msg2'),
            testAssertThrow: partial(assertThrow, Error, thrower(1))
          });
        var stream = new MemTextStream();
        runTestViaStream(loadTestSuite(TC), stream);
        assert(stream.get().startsWith(
                 'testOk(test) ok\n' +
                 'testError(test) ERROR\n' +
                 'testAssert(test) FAIL\n' +
                 'testAssertEqual(test) FAIL\n' +
                 'testAssertThrow(test) FAIL\n' +
                 '=====\n'),
               'TextTestRunner');
      },
      
      testTestClient: function () {
        var client = new TestClient();
        var aspect = weave(
          InsteadOf, require.main.exports, 'main',
          function (request) { return eval(request.data + ''); });
        function request(data) {
          return client.request({data: data});
        }
        
        assertSame(client.get(), undefined);
        assertSame(request('request.method'), 'get');
        assertSame(request('request.path'), '/');
        assertSame(request('typeof(request.get)'), 'object');
        assertSame(request('typeof(request.post)'), 'object');
        assertSame(request('typeof(request.headers)'), 'object');
        
        assertSame(client.get({data: 'request.method'}), 'get');
        assertSame(client.put({data: 'request.method'}), 'put');
        assertSame(client.post({data: 'request.method'}), 'post');
        assertSame(client.del({data: 'request.method'}), 'delete');

        var context = {};
        assertSame(
          request(
            'new Response(new Template("").render(context))').context,
          context);
          
        var H = Handler.subclass(
          {
            get: function () { return {}; }
          });
        assertSame(request('new H().handle({method: "get"})').handler, H);

        aspect.unweave();
      }
    });

  //////////////////////////////////////////////////////////////////////////////
  // base tests
  //////////////////////////////////////////////////////////////////////////////

  exports.BaseTestCase = TestCase.subclass(
    {
      name: 'base',

      testUpdate: function () {
        var obj1 = {a: 1, b: 1};
        var obj2 = {b: 2, c: 2};
        var obj3 = {c: 3, d: 3};
        var obj = update(obj1, obj2, obj3);
        assertSame(obj, obj1);
        assertSame(obj.a, obj1.a);
        assertSame(obj.b, obj2.b);
        assertSame(obj.c, obj3.c);
        update(obj2, READONLY, obj3);
        obj2.c = obj2.d = 0;
        assertSame(obj2.c, 0);
        assertSame(obj2.d, 3);
      },

      testItems: function () {
        assertEqual(items({a: 1, b: 2}), [['a', 1], ['b', 2]]);
      },

      testKeys: function () {
        assertEqual(keys({a: 1, b: 2, c: 3}), ['a', 'b', 'c']);
      },

      testValues: function () {
        assertEqual(values({a: 1, b: 2, c: 4, d: -1}), [1, 2, 4, -1]);
      },

      testFunctionDecorated: function () {
        function f() { return 42; }
        function g(func) { return function () { return func() + 1; }; }
        function h(func) { return function () { return func() * 2; }; }
        assertSame(f.decorated(g, h)(), 85);
        assertSame(f.decorated()(), 42);
      },

      testFunctionWraps: function () {
        var e = Error.subclass();
        var f = function () {}.wraps(e);
        assertSame(f.prototype, e.prototype);
        assertSame(f.prototype.constructor, f);
        assertSame(f.__proto__, e.__proto__);
      },

      testFunctionSubclass: function () {
        var C = function () {};
        var p = {};
        Object.subclass(C, p);
        assertSame(C.prototype, p);
        assertSame(p.constructor, C);
        assertSame(p.__proto__, Object.prototype);
        assertSame(C.__proto__, Function.prototype);
        var P = Function.subclass();
        C.__proto__ = P.prototype;
        var D = C.subclass();
        assertSame(D.__proto__, P.prototype);
      },

      testFunctionSubclassOf: function () {
        assert(Array.subclassOf(Object));
        assert(!Object.subclassOf(Array));
        assert(!Array.subclassOf(42));
        assert(TypeError.subclass().subclassOf(Error));
      },

      testRepr: function () {
        assertSame(repr(undefined), 'undefined');
        assertSame(repr(null), 'null');
        var o = {__repr__: function () { return 'hi'; }};
        assertSame(repr(o), 'hi');
        o.__repr__ = undefined;
        assertSame(repr(o), '[object Object]');
      },

      testObjectRepr: function () {
        assertSame(repr({}), '{}', '{} repr');
        assertSame(repr({a: 1, b: "c"}), '{a: 1, b: "c"}');
      },

      testArrayRepr: function () {
        assertSame(repr([]), '[]', '[] repr');
        assertSame(repr([1, "a", [2, 3]]), '[1, "a", [2, 3]]');
      },

      testDateRepr: function () {
        var str = 'Mon, 03 Aug 2009 14:49:29 GMT';
        assertSame(repr(new Date(str)), str);
      },

      testFunctionRepr: function () {
        function f(a, b) {}
        assertSame(repr(f), 'function f(a, b) {...}');
        assertSame(repr(function () { return 42; }), 'function () {...}');
      },

      testStringRepr: function () {
        assertSame(repr(""), '""');
        assertSame(repr('foo"\f\b\n\t\v\r'), '"foo\\"\\f\\b\\n\\t\\v\\r"');
      },

      testNumberRepr: function () {
        assertSame(repr(42), '42');
      },

      testBooleanRepr: function () {
        assertSame(repr(true), 'true');
        assertSame(repr(false), 'false');
      },

      testErrorRepr: function () {
        assertSame(repr(new Error()), 'Error');
        assertSame(repr(new Error('hello')), 'Error: hello');
        assertEqual(repr(new TypeError([1, 2])), 'TypeError: 1,2');
      },

      testRegExpRepr: function () {
        assertSame(repr(/hi/g), '/hi/g');
      },

      testAssertionError: function () {
        assertSame(new AssertionError('hi') + '', 'AssertionError: hi');
      },

      testAssert: function () {
        assert(true);
        assertThrow(AssertionError, assert, false);
      },

      testAssertEqual: function () {
        assertEqual({__eq__: function (other) { return other === 42; }}, 42);
        assertThrow(AssertionError, assertEqual, 1, 2);
      },

      testAssertSame: function () {
        assertEqual(1, 1);
        assertThrow(AssertionError, assertSame, null, undefined);
      },

      testAssertThrow: function () {
        assertThrow(Number, thrower(1));
        assertThrow(AssertionError, assertThrow, Error, thrower(1));
        assertThrow(AssertionError, assertThrow, Error, function () {});
      },

      testCmp: function () {
        assertSame(cmp(1, 1), 0);
        assertSame(cmp(Number(1), 1), 0);
        assertSame(cmp(String('hi'), 'hi'), 0);
        assertSame(cmp(true, Boolean(true)), 0);
        assertSame(cmp(1, 2), -1);
        var o = {__cmp__: function (other) { return 1; }};
        assertSame(cmp(o, 1), 1);
        assertThrow(CmpError, cmp, 1, o);

        assertThrow(CmpError, cmp, null, undefined);
        assertThrow(CmpError, cmp, null, 1);
        assertThrow(CmpError, cmp, 'a', undefined);
        assertThrow(CmpError, cmp, true, "0");
        assertThrow(CmpError, cmp, {}, 1);
        assertThrow(CmpError, cmp, {__cmp__: 42}, 1);
      },

      testEqual: function () {
        assert(equal(1, 1));
        assert(!equal(1, 2));
        assert(equal({__eq__: function () { return true; }}, 1));
        assert(!equal({__eq__: function () { return false; }}, 1));
        assert(equal({__cmp__: function () { return 1; }},
                     {__eq__: function () { return true; }}));
      },

      testErrorMeta: function () {
        var E = TypeError.subclass(
          function () { this.x = 42; },
          {name: 'E', y: 15});
        var e = new E(1);
        assertSame(e.message, '1');
        assertSame(e.x, 42);
        assertSame(e.y, 15);
        assert(SyntaxError() instanceof SyntaxError);
        assert(E() instanceof E);
        assertSame(E('hi').message, 'hi');
        assertSame(E('hi') + '', 'E: hi');
      },

      testArrayCmp: function () {
        assertSame(cmp([], []), 0);
        assertSame(cmp([1, 2, 3], [1, 2, 3]), 0);
        assertSame(cmp([1, 2], [1, 2, 3]), -1);
        assertSame(cmp([1, 2], [1]), 1);
        assertSame(cmp([1, 2, 3], [1, 2, 4]), -1);
        assertThrow(CmpError, cmp, [], 42);
      },

      testArrayEq: function () {
        assertEqual([], []);
        assertEqual([1, 2, 3], [1, 2, 3]);
        assert(!equal([1, 2, 3], [1, 2]));
        assert(!equal([1, 2, 3], [1, 2, 4]));
        assert(!equal([], null));
        assert(!equal([], undefined));
      },

      testDateCmp: function () {
        var str1 = 'Mon, 03 Aug 2009 14:49:29 GMT';
        var str2 = 'Mon, 03 Aug 2009 14:49:30 GMT';
        assertEqual(new Date(str1), new Date(str1));
        assertSame(cmp(new Date(str1), new Date(str2)), -1);
      },

      testBinaryCmp: function () {
        assertSame(cmp(new Binary(), new Binary()), 0);
        assertThrow(CmpError, cmp, new Binary(), 42);
      },

      testBinaryEq: function () {
        assert(equal(new Binary('abc'), new Binary('abc')));
        assert(!equal(new Binary(), ''));
      },

      testMd5: function () {
        assertSame(new Binary('Hello world').md5(),
                   '3e25960a79dbc69b674cd4ec67a72c62');
        assertSame(new Binary().md5(),
                   'd41d8cd98f00b204e9800998ecf8427e');
      },

      testSha1: function () {
        assertSame(new Binary('Hello world').sha1(),
                   '7b502c3a1f48c8609ae212cdfb639dee39673f5e');
        assertSame(new Binary().sha1(),
                   'da39a3ee5e6b4b0d3255bfef95601890afd80709');
      },

      testStringStartsWith: function () {
        var str = 'string';
        assert(str.startsWith('str'));
        assert(!str.startsWith('str1'));
        assert(!str.startsWith('long long string'));
      },

      testStringEndsWith: function () {
        var str = 'string';
        assert(str.endsWith('ing'));
        assert(!str.endsWith('ping'));
        assert(!str.endsWith('long long string'));
      },

      testRegExpEscape: function () {
        assertSame(RegExp.escape('[].ab?c|de\\('),
                   '\\[\\]\\.ab\\?c\\|de\\\\\\(');
      }
    });

  //////////////////////////////////////////////////////////////////////////////
  // utils tests
  //////////////////////////////////////////////////////////////////////////////

  exports.UtilsTestCase = TestCase.subclass(
    {
      name: 'utils',

      testBind: function () {
        var not_self = {'toString': function () { return 'not self'; }};
        var self = {'toString': function () { return 'self'; }};
        var func = function (arg) { return this.toString() + ' ' + arg; };
        var boundFunc = bind(func, self);
        not_self.boundFunc = boundFunc;
        assertSame(boundFunc('foo'), 'self foo');
        assertSame(not_self.boundFunc('foo'), 'self foo');
        var object = {x: 42, f: function () { return this.x; }};
        assertSame(bind('f', object)(), 42);
      },

      testPartial: function () {
        var p = partial(function (a, b, c, d) { return [a, b, c, d]; }, 1, 2);
        assertEqual(p(3, 4), [1, 2, 3, 4]);
        assertEqual(p(5, 6), [1, 2, 5, 6]);
      },

      testAbstract: function () {
        assertThrow(NotImplementedError, abstract);
      },

      testRange: function () {
        assertEqual(range(), []);
        assertEqual(range(3), [0, 1, 2]);
        assertEqual(range(4, 7), [4, 5, 6]);
        assertEqual(range(4, 7, 2), [4, 6]);
        assertEqual(range(7, 4, -1), [7, 6, 5]);
        assertThrow(ValueError, range, 2, 3, 0);
      },

      testZip: function () {
        assertEqual(zip(), []);
        assertEqual(zip([1, 2, 3]), [[1], [2], [3]]);
        assertEqual(zip([1, 2, 3], [4, 5]), [[1, 4], [2, 5]]);
        assertEqual(zip([1, 2], 'abc'), [[1, 'a'], [2, 'b']]);
        assertEqual(zip([1, 2, 3], [], [4, 5]), []);
      },

      testThrower: function () {
        assertThrow(TypeError, thrower(new TypeError('hi')));
        assertThrow(Number, thrower(1));
      },

      testTimeSince: function () {
        assertSame(timeSince(new Date('14 Jan 2010 09:32:00'),
                             new Date('14 Jan 2010 09:33:03')),
                   '1 minute');
        assertSame(timeSince(new Date('14 Jan 2010 09:32:03'),
                             new Date('14 Jan 2010 11:31:00')),
                   '1 hour, 58 minutes');
        assertSame(timeSince(new Date('14 Jan 2010 09:33:03'),
                             new Date('14 Jan 2010 09:32:00')),
                   '0 minutes');
        assertSame(timeSince(new Date('14 Jan 2010 09:32:00'),
                             new Date('14 Jan 2010 09:32:00')),
                   '0 minutes');
        assertSame(timeSince(new Date('14 Jan 2009 09:32:00'),
                             new Date('14 Jan 2010 09:33:03')),
                   '1 year');
        var date1 = new Date('14 Jan 2009 09:32:00');
        var date2 = new Date(date1);
        date2.setMilliseconds(1);
        assertSame(timeSince(date1, date2), '0 minutes');
      },

      testTimeUntil: function () {
        assertSame(timeUntil(new Date('14 Jan 2009 09:32:00'),
                             new Date('14 Jan 2010 09:33:03')),
                   '0 minutes');
        assertSame(timeUntil(new Date('14 Jan 2010 09:33:03'),
                             new Date('14 Feb 2000 09:32:00')),
                   '9 years, 11 months');
        assertSame(timeUntil(new Date('fdsa'),
                             new Date('14 Feb 2000 09:32:00')),
                   '0 minutes');
      },

      testMemTextStream: function () {
        var s = new MemTextStream();
        s.write('string');
        s.write(42);
        s.write(false);
        s.write({});
        assertSame(s.get(), s.get());
        assertSame(s.get(), 'string42false[object Object]');
        s.reset();
        assertSame(s.get(), '');
      },

      testDict: function () {
        var oldHash = core.hash;
        core.hash = function (object) {
          return object ? object.hash || 0 : 0;
        };

        var d1 = new Dict();
        var o1 = {hash: 0};
        assertSame(d1.get(o1), undefined);
        d1.set(o1, 1);
        assertSame(d1.get(o1), 1);
        assertSame(d1.get(null, 42), 42);
        assertSame(d1.setDefault(null, 0), 0);
        assertSame(d1.get(null), 0);
        var o2 = {hash: 0};
        assertSame(d1.get(o2), undefined);
        d1.set(o2, 2);
        var d2 = new Dict();
        d2.set(o2, 2);
        d2.set(null, 0);
        d2.set(o1, 1);
        assertEqual(d1, d2);
        assertEqual(d2.popItem(), [o2, 2]);
        assertSame(d1.pop(o2), 2);
        assertEqual(d1, d2);
        d2.clear();
        assertSame(d2.popItem(), undefined);
        d2.set('string', 0);
        assertEqual(d2.popItem(), ['string', 0]);
        assertEqual(d2, new Dict());
        d1.set(null, 42);
        assertSame(d1.setDefault(null), 42);
        assert(d1.has(null));
        assert(!d1.has(undefined));
        assertSame(d1.setDefault(undefined, null), null);
        assertSame(d1.setDefault(undefined, 1), null);
        var o3 = {hash: 1};
        assertSame(d1.get(o3), undefined);
        assertSame(d1.setDefault(o3, 3), 3);
        assertSame(d1.get(o3), 3);
        assertSame(d1.pop({}, 42), 42);
        assertSame(d1.pop(o3), 3);
        assert(!d1.has(o3));

        var d3 = new Dict();
        d3.set(null, 0);
        d3.set(undefined, 1);
        d3.set(0, 2);
        d3.set('', 3);
        d3.set(o1, 4);
        d3.set(o3, 5);
        var o4 = {hash: 1};
        d3.set(o4, 6);
        var o5 = {hash: 2};
        d3.set(o5, 7);
        assertEqual(d3.items(),
                    [
                      [null, 0],
                      [undefined, 1],
                      [0, 2],
                      ["", 3],
                      [o1, 4],
                      [o3, 5],
                      [o4, 6],
                      [o5, 7]
                    ]);
        assertEqual(d3.keys(),
                    [null, undefined, 0, "", o1, o3, o4, o5]);
        assertEqual(d3.values(), range(8));
        assertSame(
          repr(d3),
          ('{null: 0, undefined: 1, 0: 2, "": 3, {hash: 0}: 4,' +
           ' {hash: 1}: 5, {hash: 1}: 6, {hash: 2}: 7}'));

        var d4 = new Dict();
        assert(!equal(d3, d4));
        assert(!equal(d3, 42));
        d4.set(undefined, 1);
        d4.set(0, 2);
        d4.set('', 3);
        d4.set(o1, 4);
        d4.set(o3, 5);
        d4.set(o4, 6);
        d4.set(o5, 7);
        assert(!equal(d3, d4));
        d4.set(1, 0);
        assert(!equal(d3, d4));
        d4.pop(1);
        d4.set(null, '0');
        assert(!equal(d3, d4));
        d4.set(null, 0);
        assert(equal(d3, d4));

        core.hash = oldHash;
      },

      testEscapeHTML: function () {
        assertSame(escapeHTML('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
      },
      
      testNextMatch: function () {
        var re = new RegExp(/x/g);
        var string = 'x';
        assertSame(nextMatch(re, string)[0], 'x');
        assertSame(nextMatch(re, string), null);
        assertThrow(SyntaxError, nextMatch, new RegExp(/a/g), 'b');
        assertThrow(SyntaxError, nextMatch, new RegExp(/a/g), 'ba');
      }    
    });

  //////////////////////////////////////////////////////////////////////////////
  // template tests
  //////////////////////////////////////////////////////////////////////////////

  var testEnv = {__proto__: template.env};
  testEnv.load = function (name) {
    return {
      hello: 'hello world',
      foo: '{% block foo %}foo{% endblock %}',
      parent: (
        '{% block 1 %}<hr>{% endblock%} ' +
        '{% block 2 %}{{ super }}<br>{% endblock %}'),
      child: (
        '{% extends "parent" %}' +
        '{% block 1 %}' +
        '{{ super }} hello{% block 3 %}{% endblock %}' +
        '{% endblock %}')
    }[name];
  };


  var renderingTests = [
    ['hello world', {}, 'hello world'],
    ['{{ Infinity }}', {}, 'Infinity'],
    ['{{ -Infinity }}', {}, '-Infinity'],
    ['{{ x\t }}', {x: 42}, '42'],
    ['{{ a }} --- {{ b }}', {a: 1, b: 'hi'}, '1 --- hi'],
    ['{{ o.f }}', {o: {f: function () { return 42; }}}, '42'],
    ['{{ o1.o2.f }}', {o1: {o2: {f: function () { return 'hi'; }}}}, 'hi'],
    ['{{ x }}',
     {
       x: 0,
       getTemplateVariable: function (name) {
         return name.toUpperCase();
       }
     },
     'X'],
    ['a {{ moo %} b', {}, 'a {{ moo %} b'],
    ['{{ moo #}', {}, '{{ moo #}'],
    ['{{ moo\n }}', {}, '{{ moo\n }}'],
    ['{{ "fred" }}', {}, 'fred'],
    ['{{ "\\"fred\\"" }}', {}, '"fred"'],
    ['{{ x.1 }}', {x: ['first', 'second']}, 'second'],
    ['{{ x }}', {x: '<>'}, '&lt;&gt;'],
    ['{{ x }}', {x: safe('<>')}, '<>'],
    ['{{ x }}', {x: safe(safe('<>'))}, '<>'],
    ['{# this is hidden #}hello', {}, 'hello'],
    ['{# this is hidden #}hello{# foo #}', {}, 'hello'],
    ['foo{#  {% if %}  #}', {}, 'foo'],
    ['foo{#  {% endblock %}  #}', {}, 'foo'],
    ['foo{#  {% somerandomtag %}  #}', {}, 'foo'],
    ['foo{# {% #}', {}, 'foo'],
    ['foo{# %} #}', {}, 'foo'],
    ['foo{# %} #}bar', {}, 'foobar'],
    ['foo{# {{ #}', {}, 'foo'],
    ['foo{# }} #}', {}, 'foo'],
    ['foo{# { #}', {}, 'foo'],
    ['foo{# } #}', {}, 'foo'],
    ['{{ x|toUpperCase }}', {x: 'Hi'}, 'HI'],
    ['{{ "hello"|toUpperCase }}', {}, 'HELLO'],
    ['{{ x|toUpperCase }}', {x: 15}, '15'],
    ['{{ x|toUpperCase|toLowerCase }}', {x: 'Hi'}, 'hi'],
    ['{{ x|removeTags:"b i"|toUpperCase|toLowerCase }}',
     {x: '<b><i>Yes</i></b>'},
     'yes'],
    ['{{ "<>"|removeTags }}', {}, '<>'],
    ['{{ "<>"|removeTags:x }}', {}, '<>'],
    ['{{ "<>"|removeTags:x }}', {x: ' \t'}, '<>'],
    ['{{ x|safe }}', {x: '<>&"'}, '<>&"'],
    ['{{ x|default:"<>" }}', {}, '<>'],
    ['{{ x|default:"hi" }}', {x: '<>'}, '&lt;&gt;'],
    ['{{ x|default:a.b.c }}', {a: {b: {c: '<>'}}}, '&lt;&gt;'],
    ['{{ 0|default:.1 }}', {}, '0.1'],
    ['{{ ""|yesno }}', {}, 'no'],
    ['{{ ""|yesno:"yes,<>" }}', {}, '<>'],
    ['{{ ""|yesno:x }}', {x: 'yes,<>'}, '&lt;&gt;'],
    ['{{ "<>"|yesno:",,," }}', {}, '<>'],
    ['{{ x|join:"" }}', {x: ['<', '>']}, '&lt;&gt;'],
    ['{{ x|join }}', {x: ['<', '>']}, '&lt;&gt;'],
    ['{{ x|safe|join:"<" }}', {x: ['a', 'b']}, 'a<b'],
    ['{{ x|safe|join:y }}', {x: ['a', 'b'], y: ['<']}, 'a&lt;b'],
    ['{{ "<>"|join:x }}', {}, '<>'],
    ['{{ "<>"|escape }}', {}, '&lt;&gt;'],
    ['{{ "<>"|escape|safe|escape }}', {}, '&lt;&gt;'],
    ['{{ "<>"|escape|safe }}', {}, '<>'],
    ['{{ "  hello world "|truncateWords:1 }}', {}, 'hello ...'],
    ['{{ "hello world"|truncateWords:"asdf" }}', {}, 'hello world'],
    ['{{ "hello world"|truncateWords }}', {}, 'hello world'],
    ['{{ "hello world"|truncateWords:2 }}', {}, 'hello world'],
    ['{{ "hello world"|truncateWords:x }}', {x: null}, '...'],
    ['{{ "hello world"|truncateWords:0 }}', {x: null}, '...'],
    ['{{ 1|add:"3" }}', {}, '4'],
    ['{{ "<>"|add:2 }}', {}, '<>'],
    ['{{ x|add:2 }}', {x: '<>'}, '&lt;&gt;'],
    ['{{ 2|add:"yo" }}', {}, '2'],
    ['{{ x|safe|addSlashes }}', {x: '\\\'"\\"\''}, '\\\\\\\'\\"\\\\\\"\\\''],
    ['{{ "hello"|capFirst }}', {}, 'Hello'],
    ['{{ ""|capFirst }}', {}, ''],
    ['{{ 42|capFirst }}', {}, '42'],
    ['{{ "<hi there>"|cut:"e" }}', {}, '&lt;hi thr&gt;'],
    ['{{ "<hi there>"|cut:"e"|safe }}', {}, '<hi thr>'],
    ['{{ "a|b|c"|cut:"|" }}', {}, 'abc'],
    ['{{ x|defaultIfUndefined:42 }}', {}, '42'],
    ['{{ undefined|defaultIfUndefined:42 }}', {'undefined': 1}, '42'],
    ['{{ null|defaultIfUndefined:42 }}', {}, 'null'],
    ['{{ null|defaultIfNull:42 }}', {}, '42'],
    ['{{ x|defaultIfNull:42 }}', {}, ''],
    ['{{ "hi"|defaultIfNull:42 }}', {}, 'hi'],
    ['{% for item in items|sortObjects:"n" %}{{ item.s }}{% endfor %}',
     {
       items: [
         {n: 4, s: 'a'},
         {n: 1, s: 'b'},
         {n: 3, s: 'c'},
         {n: 2, s: 'd'}]
     },
     'bdca'],
    ['{{ x|sortObjects:"f" }}', {x: null}, ''],
    ['{{ x|sortObjects:"f" }}', {}, ''],
    ['{% for item in items|sortObjectsReversed:"n" %}{{ item.s }}{% endfor %}',
     {
       items: [
         {n: 4, s: 'a'},
         {n: 1, s: 'b'},
         {n: 3, s: 'c'},
         {n: 2, s: 'd'}
       ]
     },
     'acdb'],
    ['{{ 42|divisibleBy:2 }}', {}, 'true'],
    ['{{ "42"|divisibleBy:"2" }}', {}, 'true'],
    ['{{ "42"|divisibleBy:"4" }}', {}, 'false'],
    ['{{ "yo!"|divisibleBy:"4" }}', {}, 'false'],
    ['{{ a|escapeJS }}',
     {'a': 'testing\r\njavascript \'string" <b>escaping</b>\u2028'},
     ('testing\\x0d\\x0ajavascript \\x27string\\x22 ' +
      '\\x3cb\\x3eescaping\\x3c/b\\x3e\\u2028')],
    ['{{ "foo"|formatFileSize }}', {}, '0 bytes'],
    ['{{ 1|formatFileSize }}', {}, '1 byte'],
    ['{{ "42"|formatFileSize }}', {}, '42 bytes'],
    ['{{ 1500|formatFileSize }}', {}, '1.5 KB'],
    ['{{ 1500000|formatFileSize }}', {}, '1.4 MB'],
    ['{{ 1500000000|formatFileSize }}', {}, '1.4 GB'],
    ['{{ null|first }}', {}, 'null'],
    ['{{ undefined|first }}', {}, ''],
    ['{{ "abc"|first }}', {}, 'a'],
    ['{{ x|first }}', {x: [1, 2, 3]}, '1'],
    ['{{ "<>"|forceEscape|safe }}', {}, '&lt;&gt;'],
    ['{{ 12345|getDigit:4 }}', {}, '2'],
    ['{{ "<>"|getDigit:1 }}', {}, '<>'],
    ['{{ x|getDigit:1 }}', {x: '<>'}, '&lt;&gt;'],
    ['{{ 12345|getDigit:42 }}', {}, '0'],
    ['{{ 42|getDigit:2.1 }}', {}, '42'],
    ['{{ 42|getDigit:"foo" }}', {}, '42'],
    ['{{ "<>;&?;/"|encodeURI }}', {}, '%3C%3E;&amp;?;/'],
    ['{{ "<>;&?;/"|encodeURIComponent }}', {}, '%3C%3E%3B%26%3F%3B%2F'],
    ['{{ "abc"|last }}', {}, 'c'],
    ['{{ x|last }}', {x: [1, 2, 3]}, '3'],
    ['{{ true|last }}', {}, ''],
    ['{{ 42|last }}', {}, ''],
    ['{{ x|paragraph }}', {x: 'x&\ny'}, '<p>x&amp;<br>y</p>'],
    ['{{ x|safe|paragraph }}', {x: 'x&\ny'}, '<p>x&<br>y</p>'],
    ['{{ x|paragraph }}', {x: '\n\na\nb\n\nc\n'},
     '<p>a<br>b</p>\n\n<p>c</p>'],
    ['{{ x|paragraph }}', {x: '\n \t\n'}, ''],
    ['{{ x|breakLines }}', {x: '\n\na\nb\n\nc\n'},
     '<br><br>a<br>b<br><br>c<br>'],
    ['{{ x|numberLines }}', {x: '\n\na\n\n\nb\n\nc\nd\n\ne\n\nf'},
     ' 1 \n 2 \n 3 a\n 4 \n 5 \n 6 b\n 7 \n 8 c\n 9 d\n10 \n11 e\n12 \n13 f'],
    ['{{ 1|pluralize }}', {}, ''],
    ['{{ 2|pluralize }}', {}, 's'],
    ['{{ 2|pluralize:"a,b,c" }}', {}, ''],
    ['{{ 2|pluralize:"a,b" }}', {}, 'b'],
    ['{{ "1"|pluralize:"a,b" }}', {}, 'a'],
    ['{{ "abcde"|slice:"1,4" }}', {}, 'bcd'],
    ['{{ "abcde"|slice:"3" }}', {}, 'de'],
    ['{{ "abcde"|slice }}', {}, 'abcde'],
    ['{{ 42|slice }}', {}, '42'],
    ['{{ "abcde"|slice:"x" }}', {}, 'abcde'],
    ['{{ "abcde"|slice:"1,x" }}', {}, 'abcde'],
    ['{{ "abcde"|slice:"1,2,3" }}', {}, 'abcde'],
    ['{{ x|slice:"1,4"|join }}', {x: [1, 2, 3, 4, 5]}, '234'],
    ['{{ x|slice:3|join }}', {x: [1, 2, 3, 4, 5]}, '45'],
    ['{{ " \ta b&!-C -- d"|hyphen }}', {}, 'a-b-C-d'],
    ['{{ "<p>a<br>b</p>"|stripTags }}', {}, 'ab'],
    ['{{ "hello world"|toTitleCase }}', {}, 'Hello World'],
    ['{{ " everything\'s ok "|toTitleCase }}', {}, ' Everything\'s Ok '],
    ['{{ "\thello  world  "|countWords }}', {}, '2'],
    ['{{ "\t "|countWords }}', {}, '0'],
    ['{{ date1|timeSince:date2 }} {{ date2|timeUntil:date1 }}',
     {
       date1: new Date('14 Jan 2010 07:45:00'),
       date2: new Date('14 Jan 2010 09:32:00')
     },
     '1 hour, 47 minutes 1 hour, 47 minutes'],
    ['{{ x|toString }}', {}, ''],
    ['{{ x|toString }}', {x: null}, 'null'],
    ['{{ date|toString }}',
     {date: new Date('Wed, 24 Mar 2010 15:40:40')},
     'Wed Mar 24 2010 15:40:40'],
    ['{{ date|toString:"<h:m>" }}',
     {date: new Date('Wed, 24 Mar 2010 15:40:40')},
     '<3:40>'],
    ['{{ date|toString:format }}',
     {date: new Date('Wed, 24 Mar 2010 15:40:40'), format: '<h:m>'},
     '&lt;3:40&gt;'],
    ['{{ 42|toString:"000.00" }}', {}, '042.00'],

    ['{% comment %} yo \n\r\t wuzzup {% endcomment %}', {}, ''],
    ['{% if \t  true %}foo{% endif %}', {}, 'foo'],
    ['{% if undefined == null %}foo{% endif %}', {}, 'foo'],
    ['{% if 1 !== 1 %}foo{% else %}bar{% endif %}', {}, 'bar'],
    ['{% if 1 != 2 %}foo{% else %}bar{% endif %}', {}, 'foo'],
    ['{% if true && 1 %}foo{% endif %}', {}, 'foo'],
    ['{% if undefined || 42  %}foo{% endif %}', {}, 'foo'],
    ['{% if true === (1 && true) %}foo{% endif %}', {}, 'foo'],
    ['{% if 1==1 && 0 || 1 %}foo{% endif %}', {}, 'foo'],
    ['{% if !(false || null === undefined) %}foo{% endif %}', {}, 'foo'],
    ['{% if . %}foo{% endif %}', {'': {'': true}}, 'foo'],
    ['{% if a.b %}foo{% endif %}', {a: {b: true}}, 'foo'],
    ['{% if x === undefined %}foo{% endif %}', {}, 'foo'],
    ['{% if 3 > 2 == 4 >= 4 === 5 < 10 == true %}foo{% endif %}', {}, 'foo'],
    ['{% if x.y.z %}foo{% endif %}', {}, ''],
    ['{% for x in y %}{{ x }}{% endfor %}', {y: [1, 2, 3]}, '123'],
    ['{% for x in "" %}{% empty %}empty{% endfor %}', {}, 'empty'],
    ['{% for x in y %}foo{% endfor %}', {}, ''],
    ['{% for x in "abc" %}{{ forloop.counter }}{% endfor %}', {}, '123'],
    ['{% for x in "abc" %}{{ forloop.counter0 }}{% endfor %}', {}, '012'],
    ['{% for x in "abc" %}{{ forloop.revcounter }}{% endfor %}', {}, '321'],
    ['{% for x in "abc" %}{{ forloop.revcounter0 }}{% endfor %}', {}, '210'],
    ['{% for x in "abc" %}{{ forloop.first }} {% endfor %}', {},
     'true false false '],
    ['{% for x in "abc" %}{{ forloop.last }} {% endfor %}', {},
     'false false true '],
    [('{% for x in "abc" %}' +
      '{% for y in "123" %}{{ forloop.parentloop.counter }}{% endfor %}' +
      '{% endfor %}'),
     {},
     '111222333'],
    ['{% for n in "123" reversed %}{{ n }}{% endfor %}', {}, '321'],
    ['{% for n in s reversed %}{{ n }}{% endfor %}',
     {s: new String('123')},
     '321'],
    ['{% extends "hello" %}', {}, 'hello world'],
    ['{% extends x %}', {x: 'hello'}, 'hello world'],
    ['say {% extends "hello" %} yo!', {}, 'say hello world'],
    ['{% extends  "foo" %}', {}, 'foo'],
    ['{% extends "foo" %}{% block foo %}bar{% endblock %}', {}, 'bar'],
    ['{% extends "foo" %}{% block foo %}bar{% endblock foo  %}', {}, 'bar'],
    ['{% extends "child" %}', {}, '<hr> hello <br>'],
    ['{% extends "child" %}{% block 2 %}yo!{% endblock %}',
     {},
     '<hr> hello yo!'],
    ['{% extends "child" %}{% block 3 %} yo!{% endblock %}',
     {},
     '<hr> hello yo! <br>'],
    [('{% extends "child" %}' +
      '{% block 1 %}{{ super }} hi{% endblock %}' +
      '{% block 3 %} yo!{% endblock %}'),
     {},
     '<hr> hello yo! hi <br>'],
    ['{% for i in "12345" %}{% cycle "a" "b" %}{% endfor %}', {}, 'ababa'],
    ['{% for i in "abcd" %}{% cycle 1 2 3 as x %}{% cycle x %}{% endfor %}',
     {},
     '12312312'],
    ['{% cycle 1 2 as x %}{% cycle "a" "b" as x %}{% cycle x %}', {}, '1ab'],
    ['{% filter escape %}<>{% endfilter %}', {}, '&lt;&gt;'],
    ['{% filter truncateWords:3 %}foo & bar baz{% endfilter %}', {},
     'foo & bar ...'],
    ['{% filter removeTags:"i"|escape %}<i>&</i>{% endfilter %}', {},
     '&amp;'],
    ['{% firstOf "" a "<>" %}', {}, '<>'],
    ['{% firstOf ""|default:"hello world" 42 %}', {}, 'hello world'],
    ['{% firstOf a b c %}', {}, ''],
    ['{% firstOf x %}', {x: '<>'}, '&lt;&gt;'],
    [('{% for x in "aaabbcdddd" %}' +
      '{% ifchanged %}{{ x }}{% endifchanged %}' +
      '{% endfor %}'),
     {},
     'abcd'],
    [('{% for x in "aaabbcdddd" %}' +
      '{% ifchanged %}{{ x }}{% else %}*{% endifchanged %}' +
      '{% endfor %}'),
     {},
     'a**b*cd***'],
    [('{% for x in "aaabbcdddd" %}' +
      '{% ifchanged x %}!{% else %}*{% endifchanged %}' +
      '{% endfor %}'),
     {},
     '!**!*!!***'],
    [('{% for x in "aaabbcdddd" %}' +
      '{% for y in "121" %}' +
      '{% ifchanged x y %}!{% else %}*{% endifchanged %}' +
      '{% endfor %}' +
      '{% endfor %}'),
     {},
     '!!!*!!*!!!!!*!!!!!!!!*!!*!!*!!'],
    ['{% include "hello" %}', {}, 'hello world'],
    ['{% for x in "12" %}{% include "hello" %}{% endfor %}',
     {},
     'hello worldhello world'],
    ['{% include x %}', {x: 'hello'}, 'hello world'],
    ['{% spaceless %}<b> <i> hi  </i>\t </b>\t{% endspaceless %}', {},
     '<b><i> hi  </i></b>\t'],
    ['{% templateTag openBlock %}', {}, '{%'],
    ['{% widthRatio a b 0 %}', {a: 50, b: 100}, '0'],
    ['{% widthRatio a b 100 %}', {a: 0, b: 0}, ''],
    ['{% widthRatio a b 100 %}', {a: 0, b: 100}, '0'],
    ['{% widthRatio a b 100 %}', {a: 50, b: 100}, '50'],
    ['{% widthRatio a b 100 %}', {a: 100, b: 100}, '100'],
    ['{% widthRatio a b 100 %}', {a: 50, b: 80}, '63'],
    ['{% widthRatio a b 100 %}', {a: 50, b: 70}, '71'],
    ['{% widthRatio a b 100.0 %}', {a: 50, b: 100}, '50'],
    ['{% widthRatio a b c %}', {a: 50, b: 100, c: 100}, '50'],
    ['{% with "<>" as x %}{{ x }}{% endwith %}', {}, '<>'],
    ['{% with "<>"|escape as x %}{{ x }}{% endwith %}', {}, '&lt;&gt;'],
    ['{% with y as x %}{{ x }}{% endwith %}', {y: '<>'}, '&lt;&gt;'],
    ['{% with "a>b" as x %}{{ x|toUpperCase }}{% endwith %}', {}, 'A>B'],
    ['{% url "test" x y %}', {x: '&', y: '"'}, '/%3C%3E/&/%22/'],
    ['{% url "test" 1 2 as x %}{{ x }}', {}, '/%3C%3E/1/2/'],
    ['{% url "test" as x %}{{ x }}', {}, ''],
    ['{% url "page" "a" "b" %}', {}, '/%3C%3E/a/b/page/'],
    ['{% csrfToken %}', {},
     ('<div style=\"display:none;\">' +
      '<input type=\"hidden\" name=\"csrfToken\" value=\"42\">' +
      '</div>')],
    ['{% for item in object|items %}{{ item.1 }}{% endfor %}',
     {object: {a: 1, b: 2, c: 3}},
     '123'],
    ['{{ object|items|last|last }}',
     {object: safe({a: '', b: '<>'})},
     '<>'],
    ['{% now "<MM yy>" %}', {}, new Date().toString('<MM yy>')],
    ['{% now f %}', {f: '<MM yy>'}, new Date().toString('&lt;MM yy&gt;')]
  ];


  var errorTests = [
    '{{ multi word variable }}',
    '{{   \t }}',
    '{{ va>r }}',
    '{{ (var.r) }}',
    '{{ sp%am }}',
    '{{ eggs! }}',
    '{{ moo? }}',
    '{{ moo #} {{ cow }}',
    '{{ x|does_not_exist }}',
    '{{ x|upper(xxx) }}',
    '{{ x |upper }}',
    '{{ x| upper }}',
    '{{ x|default: 1 }}',
    '{% does_not_exist %}',
    '{%  %}',
    '{% comment %}',
    '{% if && %}{% endif %}',
    '{% if > %}{% endif %}',
    '{% if & %}{% endif %}',
    '{% if &| %}{% endif %}',
    '{% if a && %}{% endif %}',
    '{% if ! %}{% endif %}',
    '{% if a b %}{% endif %}',
    '{% if a !b %}{% endif %}',
    '{% if a &&|| b %}{% endif %}',
    '{% if a (b) %}{% endif %}',
    '{% if (a&&) %}{% endif %}',
    '{% if (a)) %}{% endif %}',
    '{% if (a %}{% endif %}',
    '{% if %}{% endif %}',
    '{{ x }} {% extends "hello" %}',
    '{% if x %}{% endif %}{% extends "hello" %}',
    '{% block %}{% endblock %}',
    '{% block 1 2 %}{% endblock %}',
    '{% block 1 %}{% endblock %}{% block 1 %}{% endblock %}',
    '{% cycle %}',
    '{% cycle x %}',
    '{% cycle 1 2 as x %}{% cycle y %}',
    '{% firstOf %}',
    '{% include  %}',
    '{% regroup %}',
    '{% regroup a yo! b as c %}',
    '{% regroup a by b yo! c %}',
    '{% templateTag fdsa %}',
    '{% templateTag %}',
    '{% widthRatio %}',
    '{% with %}{% endwith %}',
    '{% with 1 1 1 %}{% endwith %}',
    '{% url %}',
    '{% csrfToken 1 %}',
    '{% for a in b %}',
    '{% for a in b %}{% empty %}',
    '{% for %}{% endfor %}',
    '{% for x y z %}{% endfor %}',
    '{% for a.b in c %}{% endfor %}'
  ];


  exports.TemplateTestCase = TestCase.subclass(
    {
      name: 'template',

      testRendering: function () {
        var oldRoot = require.main.exports.root;
        require.main.exports.root = new URLMap(
          ['<>/',
           ['',
            ['', function () {}, 'test',
             ['page/', function () {}, 'page']
            ]
           ]
          ]);
        template.getCsrfToken = function () { return '42'; };
        renderingTests.forEach(
          function (test) {
            assertSame(new Template(test[0], testEnv).render(test[1]),
                       test[2],
                       'Rendering ' + repr(test[0]));
          });
        require.main.exports.root = oldRoot;
      },
      
      testStatic: function () {
        var storage = require.main.storage;
        var oldCommit = storage.commit;
        delete storage.commit;
        assertSame(
          new Template('{% static "a b" %}').render(), '/static/a%20b');
        storage.commit = '123';
        assertSame(
          new Template('{% static "a b" %}').render(), '/static/123/a%20b');
        storage.commit = oldCommit;
      },

      testNow: function () {
        new Template('{% now %}').render();
      },

      testErrors: function () {
        errorTests.forEach(
          function (test) {
            assertThrow(TemplateSyntaxError,
                        function () {
                          new Template(test, testEnv);
                        });
          });
        assertThrow(NotImplementedError,
                    function () {
                      new Template('{{ x }}').render({x: abstract});
                    });
      },

      testSmartSplit: function () {
        var smartSplit = template.smartSplit;
        assertEqual(smartSplit('This is "a person\'s" test.'),
                    ['This', 'is', '"a person\'s"', 'test.']);
        assertEqual(smartSplit("Another 'person\\'s' test."),
                    ['Another', "'person\\'s'", 'test.']);
        assertEqual(smartSplit('A "\\"funky\\" style" test.'),
                    ['A', '"\\"funky\\" style"', 'test.']);
        assertEqual(smartSplit('""|default:"hello world" 42'),
                    ['""|default:"hello world"', '42']);
        assertEqual(smartSplit('"'), ['"']);
        assertEqual(smartSplit('hi'), ['hi']);
        assertEqual(smartSplit(' \t'), []);
      }
    });

  //////////////////////////////////////////////////////////////////////////////
  // http tests
  //////////////////////////////////////////////////////////////////////////////

  exports.HttpTestCase = TestCase.subclass(
    {
      name: 'http',

      testErrors: function () {
        assertSame(Failure().status, http.BAD_REQUEST);
        assertSame(Failure().message, 'Bad request');
        assertSame(NotFound().message, 'Not found');
        assertSame(Forbidden().message, 'Forbidden');
      }
    });

  //////////////////////////////////////////////////////////////////////////////
  // url tests
  //////////////////////////////////////////////////////////////////////////////

  exports.UrlTestCase = TestCase.subclass(
    {
      name: 'url',

      testRoute: function () {
        function f () {}
        function g() {}
        function h() {}
        function m() {}
        assertEqual(
          new URLMap(['', new URLMap(['', new URLMap(f)])]).resolve('a/b/'),
          [f, ['a', 'b']]);
        var root = new URLMap(
          ['abc/', ['', f, 'f1']],
          [/123/, g, 'g1'],
          ['', g, 'g2',
           [/a(.)c\//, h, 'h'],
           [/../, f, 'f2'],
           [/./, m]
          ]);
        assertEqual(root.resolve('abc/xyz/'), [f, ['xyz']]);
        assertEqual(root.resolve('xyz/'), [g, ['xyz']]);
        assertThrow(ResolveError, function () { root.resolve(''); });
        assertThrow(ResolveError, function () { root.resolve('xyz/abd'); });
        assertThrow(ResolveError, function () { root.resolve('xyz/xabc'); });
        assertThrow(ResolveError, function () { root.resolve('/'); });
        assertEqual(root.resolve('xyz/abc/'), [h, ['xyz', 'b']]);
        assertEqual(root.resolve('xyz/a'), [m, ['xyz', 'a']]);
        assertEqual(root.resolve('xyz/ab'), [f, ['xyz', 'ab']]);
        assertEqual(root.reverse('h', 'xyz', 0), 'xyz/a0c/');
        assertEqual(root.reverse('f1', '123'), 'abc/123/');
        assertEqual(root.reverse('f2', '123', 45), '123/45');
        assertThrow(ReverseError,
                    function () { root.reverse(function () {}); });
        assertThrow(ReverseError, function () { root.reverse('g1', 1, 2); });
        assertThrow(ReverseError, function () { root.reverse('g2', 1, 2); });
        assertThrow(ReverseError, function () { root.reverse('no-such'); });
        assertThrow(TypeError, function () { new URLMap(42); });
        assertThrow(TypeError, function () { new URLMap([f]); });
        assertThrow(ValueError, function () {
                      var map = new URLMap(['x', f, 'name'], ['y', g, 'name']);
                      map.reverse('other-name');
                    });
      },

      testResolve: function () {
        assertThrow(ValueError, resolve, 'relative/path');
      }
    });

  //////////////////////////////////////////////////////////////////////////////
  // rest tests
  //////////////////////////////////////////////////////////////////////////////

  exports.RestTestCase = TestCase.subclass(
    {
      name: 'rest',
      
      testRequest: function () {
        var request = {
          __proto__: Request.prototype,
          headers: {cookie: 'a%20b=c%3Bd; y=; x=42'}
        };
        assertEqual(
          items(request.cookies), [['a b', 'c;d'], ['y', ''], ['x', '42']]);
      },
      
      testResponse: function () {
        var response = new Response();
        response.setCookie(
          'a b', 'c+d', {path: '/some/path', secure: true, httpOnly: true});
        response.setCookie(
          'x', 42,
          {domain: '.x.com', expires: new Date('Tue Jan 04 2011 14:33:37')});
        response.setCookie('y');
        assertEqual(
          response.headers['Set-Cookie'],
          [
            'a%20b=c%2Bd; path=/some/path; secure; HttpOnly',
            'x=42; path=/; domain=.x.com; expires=Tue, 04-Jan-2011 14:33:37 GMT',
            'y=; path=/'
          ]);
      },

      testRedirect: function () {
        var response = redirect('xyz');
        assertSame(response.content, '');
        assertSame(response.status, http.FOUND);
        assertSame(response.headers.Location, 'xyz');
      },

      testRender: function () {
        template.env = {__proto__: template.env};
        template.env.load = function (name) {
          return '{{' + name + '}}';
        };
        var headers = {};
        var response = render('x', {x: 42}, 1, headers);
        assertSame(response.content, '42');
        assertSame(response.status, 1);
        assertSame(response.headers, headers);
        template.env = template.env.__proto__;
      },

      testHandler: function () {
        var H = Handler.subclass(
          {
            func:    function () { return 'func';    },
            del:     function () { return 'del';     },
            perform: function () { return 'perform'; }
          });
        var h = new H();
        assertSame(h.handle({method: 'delete'}), 'del');
        assertSame(h.handle({method: 'del'}), 'perform');
        assertSame(h.handle({method: 'func'}), 'perform');
        var H1 = H.subclass(
          {
            get: function () {},
            put: 42,
            perform: 42
          });
        h1 = new H1();
        h1.get = 42;
        ['get', 'post', 'put', 'delete'].forEach(
          function (method) {
            assertThrow(
              Failure, function () { h1.handle({method: method}); });
          });
      },
      
      testApp: function () {
        var oldMain = require.main.exports.main;
        require.main.exports.main = function (request) {
          request.cookies;
          return new Response();
        };
        assertSame(
          require.main.exports.app(
            {method: 'GET', headers: {}}).headers.Vary,
          'Cookie');
        require.main.exports.main = function (request) {
          request.cookies;
          return new Response('', http.OK, {Vary: 'Accept-Language'});
        };
        assertSame(
          require.main.exports.app(
            {method: 'GET', headers: {}}).headers.Vary,
          'Accept-Language, Cookie');
        require.main.exports.main = oldMain;
      },

      testServe: function () {
        var E = Error.subclass();

        var EchoHandler = Handler.subclass(
          function (request, string) {
            this.string = string;
          },
          {
            get: function () {
              return new Response(this.string);
            }
          });

        var MethodHandler = Handler.subclass(
          {
            perform: function(request) {
              return new Response(request.method);
            }
          });

        var UpperHandler = Handler.subclass(
          {
            get: function (request, string) {
              return new Response(string.toUpperCase());
            }
          });

        var LengthHandler = EchoHandler.subclass(
          {
            put: function () {
              return new Response(this.string.length);
            }
          });

        var oldRoot = require.main.exports.root;
        require.main.exports.root = new URLMap(
          ['', EchoHandler,
           ['method', MethodHandler],
           ['upper', UpperHandler],
           ['error', thrower(E())],
           ['length', LengthHandler]],
          ['csrf-token', function () {
             return new Response(new Template('{% csrfToken %}').render());
           }],
          ['http-error', function () {
             throw new Failure('hi');
           }],
          ['tuple-does-not-exist', function () {
             throw new TupleDoesNotExist('hello');
           }],
          ['path-with-slash/', function () {}]);

        assertSame(defaultServe({path: '/a/b'}).status, http.NOT_FOUND);
        var response = defaultServe({path: '/abc'});
        assertSame(response.status, http.MOVED_PERMANENTLY);
        assertSame(response.headers.Location, '/abc/');
        assertThrow(ResolveError, serve, {path: '/abc'});
        assertSame(serve({path: '/abc/', method: 'get'}).content, 'abc');
        assertSame(defaultServe({path: '/abc/', method: 'put'}).status,
                   http.METHOD_NOT_ALLOWED);
        assertThrow(E, defaultServe, {path: '/abc/error'});
        assertSame(serve({path: '/abc/method', method: 'PUT'}).content,
                   'PUT');
        assertSame(serve({path: '/abc/upper', method: 'get'}).content,
                   'ABC');
        assertSame(serve({path: '/abc/length', method: 'put'}).content,
                   3);
        assertSame(defaultServe({path: '/a/length', method: 'get'}).status,
                   http.METHOD_NOT_ALLOWED);
        assertSame(defaultServe({
                                  method: 'post',
                                  path: '/abc/method',
                                  post: {},
                                  headers: {},
                                  cookies: {csrfToken: 'x'}
                                }).status,
                   http.FORBIDDEN);
        assertSame(defaultServe({
                                  method: 'post',
                                  path: '/abc/method',
                                  post: {},
                                  headers: {
                                    'x-requested-with': 'XMLHttpRequest'
                                  },
                                  cookies: {csrfToken: 'x'}
                                }).status,
                   http.OK);
        assertSame(defaultServe({
                                  method: 'post',
                                  path: '/abc/method',
                                  post: {csrfToken: 'x'},
                                  headers: {},
                                  cookies: {csrfToken: 'x'}
                                }).status,
                   http.OK);
        assertSame(
          defaultServe(
            {
              method: 'post',
              path: '/',
              post: {csrfToken: 'b'},
              headers: {},
              cookies: {csrfToken: 'a'}
            }).status,
          http.FORBIDDEN);
        assert(
          defaultServe(
            {
              path: '/csrf-token',
              cookies: {csrfToken: '42'}
            }).content.indexOf('42') != -1);
        assert(
          defaultServe(
            {path: '/csrf-token', cookies: {}}).headers['Set-Cookie']);
        response = defaultServe({path: '/http-error'});
        assertSame(response.status, http.BAD_REQUEST);
        assertSame(response.content, 'hi');
        response = defaultServe({path: '/tuple-does-not-exist'});
        assertSame(response.status, http.NOT_FOUND);
        assertSame(response.content, 'hello');
        response = defaultServe({path: '/path-with-slash'});
        assertSame(response.status, http.MOVED_PERMANENTLY);
        assertSame(response.headers.Location, '/path-with-slash/');

        var oldStorage = require.main.storage;
        require.main.storage = {
          read: function (path) { assertSame(path, 'static/main.css'); }
        };
        assertEqual(
          items(defaultServe({path: '/static/main.css'}).headers),
          [['Cache-Control', 'no-cache'], ['Content-Type', 'text/css']]);
        assertSame(
          defaultServe({path: '/static/no-such'}).status, http.NOT_FOUND);
        require.main.storage = {
          repo: {
            getStorage: function (commit) {
              assertSame(commit, '123');
              return {
                read: function (path) {
                  assertSame(path, 'static/icon.png');
                }
              }
            }
          }
        };
        assertSame(defaultServe({path: '/static/bad'}).status, http.NOT_FOUND);
        assertSame(
          defaultServe({path: '/static/no-such/icon.png'}).status,
          http.NOT_FOUND);
        assertSame(
          defaultServe({path: '/static/123/no-such'}).status,
          http.NOT_FOUND);
        assertEqual(
          items(defaultServe({path: '/static/123/icon.png'}).headers),
          [
            ['Cache-Control', 'max-age=315360000'],
            ['Content-Type', 'image/png']
          ]);
        require.main.storage = oldStorage;

        require.main.exports.root = oldRoot;
      },
      
      testRequestHost: function () {
        var response = requestHost('example.com', {get: {x: 42}});
        assertSame(response.status, http.OK);
        assertEqual(response.headers.server, 'Apache');
        assert((response.content + '').startsWith('<!DOCTYPE HTML '));
      }
    });

  //////////////////////////////////////////////////////////////////////////////
  // rv tests
  //////////////////////////////////////////////////////////////////////////////

  exports.RvTestCase = TestCase.subclass(
    {
      name: 'rv',

      setUp: function () {
        db.drop(db.list());
      },

      tearDown: function () {
        db.drop(db.list());
      },

      testAttr: function () {
        assert(rv.X instanceof RelVar);
        assertThrow(ValueError,
                    function () { rv.X.create({x: 'unparseble'}); });
        assertThrow(ValueError,
                    function () { rv.X.create({x: 'number string'}); });
        assertThrow(ValueError,
                    function () { rv.X.create({x: 'number string'}); });
        assertThrow(ValueError,
                    function () { rv.X.create({x: ['unique', 1]}); });
        rv.Check.create({n: 'number check (n != 42)'});
        rv.X.create({i: ['integer unique', '15']});
        rv.Y.create(
          {
            i: ['unique integer', -1],
            s: ' \t\nserial\t -> Y.i ->X.i ',
            n: ['number->Check.n ', '42'],
            d: 'date',
            j: ['json', [1, 2, 3]],
            b: 'binary'
          });
        assertSame(rv.Y.getHeader().i, 'integer');
        assertSame(rv.Y.getHeader().s, 'serial');
        assertSame(rv.Y.getHeader().d, 'date');
        assertSame(rv.Y.getHeader().j, 'json');
        assertEqual(rv.Y.getForeign().sort(),
                    [
                      [['n'], 'Check', ['n']],
                      [['s'], 'X', ['i']],
                      [['s'], 'Y', ['i']]
                    ]);
        assertEqual(items(rv.X.getDefault()), [['i', 15]]);
        assertEqual(items(rv.Y.getDefault()).sort(),
                    [['i', -1], ['j', [1, 2, 3]], ['n', 42]]);
        assertThrow(db.ConstraintError,
                    function () { rv.Check.insert({n: 42}); });
      },

      testConstr: function () {
        assertThrow(ValueError, function () { rv.X.create({}, 'invalid'); });
        rv.X.create({i: 'integer', n: 'number', s: 'string'},
                    'unique [ i , n]',
                    ' \tunique[n,s  ]\t',
                    ' check i != 42     ');
        rv.Y.create({ii: 'integer', nn: 'number', ss: 'string'},
                    ' [ ii , nn ]-> X[i,n]',
                    '[ss,nn]   ->X  [s  ,n ] ');
        assertThrow(db.ConstraintError,
                    function () { rv.X.insert({i: 42, n: 0, s: ''}); });
        assertEqual(
          rv.Y.getForeign().sort(),
          [[["ii", "nn"], "X", ["i", "n"]], [["ss", "nn"], "X", ["s", "n"]]]);
      },

      testGetOne: function () {
        rv.X.create({x: 'number'});
        rv.X.insert({x: 1});
        rv.X.insert({x: 2});
        rv.X.insert({x: 3});
        assert(rv.X.IsAmbiguous.subclassOf(TupleIsAmbiguous));
        assert(rv.X.DoesNotExist.subclassOf(TupleDoesNotExist));
        assertSame(rv.X.IsAmbiguous().message,
                   'X is ambiguous');
        assertSame(rv.X.DoesNotExist().message,
                   'X does not exist');
        assertSame(rv.X.IsAmbiguous.prototype.name,
                   'rv.X.IsAmbiguous');
        assertSame(rv.X.DoesNotExist.prototype.name,
                   'rv.X.DoesNotExist');
        assertThrow(rv.X.IsAmbiguous,
                    function () { rv.X.where('x % 2 == 1').getOne(); });
        assertThrow(rv.X.DoesNotExist,
                    function () { rv.X.where({x: 4}).getOne(); });
        assertSame(rv.X.where('x % 2 == 0').getOne().x, 2);
        assertSame(rv.X.where('x > $', 2).getOne({attr: 'x'}), 3);
        assertSame(rv.X.all().getOne({by: 'x', length: 1}).x, 1);
        assertSame(rv.X.all().getOne({by: 'x', start: 2}).x, 3);
        assertSame(rv.X.all().getOne({by: 'x % $', length: 1}, 2).x, 2);
        rv.X.drop();
      },

      testSelection: function () {
        rv.X.create({n: 'number', b: 'boolean', s: 'string'});
        rv.X.insert({n: 0, b: false, s: 'zero'});
        rv.X.insert({n: 1, b: false, s: 'one'});
        rv.X.insert({n: 42, b: true, s: 'the answer'});
        assertSame(rv.X.where('b').relVar, rv.X);
        assertEqual(rv.X.where({b: false, n: 1}).get({attr: 's'}), ['one']);
        assertEqual(
          rv.X.where('b').get().map(items),
          [[['n', 42], ['b', true], ['s', 'the answer']]]);
        assertEqual(
          rv.X.where('b == $', false).get({attr: 'n', by: 'n'}),
          [0, 1]);
        assertEqual(
          rv.X.where({b: false})
            .get({only: ['n', 's'], by: ['s']}).map(items),
          [[['n', 1], ['s', 'one']], [['n', 0], ['s', 'zero']]]);
        assertEqual(
          rv.X.where('s != $', 'five').get({attr: 'n', by: 'n * $'}, -1),
          [42, 1, 0]);
        assertSame(rv.X.where('n > $', 5).count(), 1);
        rv.X.where('b == $', false)
          .update({n: 'n + $1', s: 's + n + $2'}, 1, '!');
        assertEqual(
          rv.X.all().get({only: ['n', 's'], by: 'n'}).map(items),
          [
            [['n', 1], ['s', 'zero0!']],
            [['n', 2], ['s', 'one1!']],
            [['n', 42], ['s', 'the answer']]
          ]);
        rv.X.where('!b').set({s: '$'});
        assertEqual(rv.X.all().get({attr: 's', by: 's'}), ['$', 'the answer']);
      },

      testRelVar: function () {
        rv.Y.create({d: ['number', 42], s: 'serial'});
        assertEqual(items(rv.Y.insert({d: 1, s:1})).sort(),
                    [['d', 1], ['s', 1]]);
        assertEqual(items(rv.Y.insert({d: 1})).sort(),
                    [['d', 1], ['s', 0]]);
        assertThrow(db.ConstraintError, function () { rv.Y.insert({d: 1}); });
        assertEqual(items(rv.Y.insert({d: 1})).sort(),
                    [['d', 1], ['s', 2]]);
        assertEqual(items(rv.Y.insert({})).sort(),
                    [['d', 42], ['s', 3]]);
        assertEqual(items(rv.Y.insert({})).sort(),
                    [['d', 42], ['s', 4]]);
        rv.Y.drop();
      },

      testRV: function () {
        assertEqual(keys(rv), []);
        assertSame(delete rv.X, false);
        rv.X = 42;
        assertSame('X' in rv, false);
        assertSame('hasOwnProperty' in rv, false);
        rv.Y.create({});
        rv.X.create({});
        assertSame('X' in rv, true);
        assertEqual(keys(rv), ['X', 'Y']);
      },

      testAddAttrs: function () {
        rv.X.create({});
        assertThrow(ValueError, function () { rv.X.addAttrs({x: ['', 42]}); });
        assertThrow(ValueError,
                    function () { rv.X.addAttrs({x: ['unknown-type', 42]}); });
        rv.X.addAttrs(
          {
            n: ['number', 42],
            s: ['string', ''],
            b: ['boolean', false],
            d: ['date', new Date()],
            j: ['json', {}],
            i: ['integer', 0]
          });
        assertEqual(
          items(rv.X.getHeader()),
          [
            ['n', 'number'],
            ['s', 'string'],
            ['b', 'boolean'],
            ['d', 'date'],
            ['j', 'json'],
            ['i', 'integer']
          ]);
      },

      testDropAttrs: function () {
        rv.X.create({n: 'number', s: 'string', b: 'boolean'});
        rv.X.dropAttrs('n', 'b');
        assertEqual(items(rv.X.getHeader()), [['s', 'string']]);
      },

      testAddDefault: function () {
        rv.X.create({n: 'number'});
        rv.X.addDefault({n: 42});
        assertEqual(items(rv.X.getDefault()), [['n', 42]]);
      },

      testDropDefault: function () {
        rv.X.create({n: ['number', 42], s: ['string', '']});
        rv.X.dropDefault('n', 's');
        assertEqual(items(rv.X.getDefault()), []);
      },

      testAddConstrs: function () {
        rv.X.create({n: 'unique number'});
        rv.X.insert({n: 0});
        rv.Y.create({n: 'number', s: 'string', b: 'boolean'});
        rv.Y.addConstrs('unique [n]');
        rv.Y.addConstrs('[n] -> X[n]', 'check !b');
        assertEqual(rv.Y.getUnique(), [['n', 's', 'b'], ['n']]);
        assertEqual(rv.Y.getForeign(), [[['n'], 'X', ['n']]]);
        assertThrow(db.ConstraintError,
                    function () { rv.Y.insert({n: 0, s: '', b: true}); });
      },

      testDropAllConstrs: function () {
        rv.X.create({n: 'unique number'});
        rv.Y.create(
          {n: 'number -> X.n', s: 'unique string', b: 'boolean check (!b)'});
        rv.Y.dropAllConstrs();
        assertEqual(rv.Y.getUnique(), [['n', 's', 'b']]);
        assertEqual(rv.Y.getForeign(), []);
        rv.Y.insert({n: 0, s: '', b: true});
      }
    });

  //////////////////////////////////////////////////////////////////////////////
  // aspect tests
  //////////////////////////////////////////////////////////////////////////////

  exports.AspectTestCase = TestCase.subclass(
    {
      name: 'aspect',

      testAspects: function () {
        var f = function (x) { return x; };
        var g = function (x) { throw x; };
        var C = Object.subclass({f: f, g: g, n: 42});
        var c = new C();

        var aspect0 = weave(Before, C, 'f', function (args) { ++args[0]; });
        assert(aspect0 instanceof Before);
        assertSame(aspect0, C.prototype.f);
        assertSame(c.f(0), 1);
        aspect0.enabled = false;
        assertSame(c.f(0), 0);
        aspect0.enabled = true;
        assertSame(c.f(0), 1);
        var aspect1 = weave(
          Before, c, 'f',
          function (args, method) { Array.push(args, method.length); });
        assertSame(c.f(), 2);
        var aspect2 = weave(Before, C, 'f', function (args) { args[0] += 2;});
        assertSame(c.f(), 4);
        assertSame(aspect0.unweave(), aspect2);
        assertSame(aspect1.unweave(), aspect2);
        assertSame(c.f(15), 17);
        assertSame(C.prototype.f.callSource(c, 0), 0);
        assertSame(aspect2.unweave(), f);

        var aspect3 = weave(After, C, 'f',
                            function (result) { return result + 1; });
        assertSame(c.f(0), 1);
        var aspect4 = weave(
          After, C, 'f',
          function (result, args, method) {
            return method + result + args[0];
          });
        assertSame(c.f(0), 'f10');
        aspect3.enabled = false;
        assertSame(c.f(0), 'f00');
        aspect3.unweave();
        aspect4.unweave();

        var aspect5 = weave(AfterCatch, C, 'f', function () { return 42; });
        assertSame(c.f(0), 0);
        var aspect6 = weave(
          AfterCatch, C, 'g',
          function (error, args, method) {
            return [method, Array.apply(null, args), error].join(' ');
          });
        assertSame(c.g(1,2,3), 'g 1,2,3 1');
        aspect5.unweave();
        aspect6.unweave();

        var buf;
        function save(args, method) {
          buf = method + ' ' + Array.apply(null, args);
        }
        var aspect7 = weave(AfterFinally, C, 'f', save);
        c.f(1, 2, 3);
        assertSame(buf, 'f 1,2,3');
        var aspect8 = weave(AfterFinally, C, 'g', save);
        var aspect9 = weave(AfterCatch, C, 'g', function () {});
        c.g(4, 5, 6);
        assertSame(buf, 'g 4,5,6');
        aspect7.unweave();
        aspect8.unweave();
        aspect9.unweave();

        var aspect10 = weave(
          Around, C, 'g',
          function (source, args, method) {
            try {
              return source.apply(this, args);
            } catch (error) {
              return [method, error, args[1]].join(' ');
            }
          });
        assertSame(c.g(1, 2), 'g 1 2');
        var aspect11 = weave(InsteadOf, C, 'g', function (x) { return -x; });
        assertSame(c.g(1, 2), -1);
        aspect10.unweave();
        aspect11.unweave();

        assertThrow(TypeError, weave, Before, C, 'n', function () {});
        weave(Aspect, C, 'f', function () {});
        assertThrow(NotImplementedError, function () { c.f(); });
      },

      testWeave: function () {
        var f = function () {};
        var f1 = f.f1 = function () { return 1; };
        var f2 = f.f2 = function () { return 2; };
        var f3 = f.f3 = function () { return 3; };
        var aspects = weave(After, f, /[12]/,
                            function (result) { return -result; },
                            true);
        assertSame(f.f1(), -1);
        assertSame(f.f2(), -2);
        assertSame(f.f3(), 3);
        aspects.disable();
        assertSame(f.f1(), 1);
        aspects.enable();
        assertSame(f.f1(), -1);
        assertEqual(aspects.unweave(), [f1, f2]);
        assertSame(f.f1(), 1);
        assertSame(f.f2(), 2);
      }
    });

  //////////////////////////////////////////////////////////////////////////////
  // format tests
  //////////////////////////////////////////////////////////////////////////////

  exports.FormatTestCase = TestCase.subclass(
    {
      testDateToString: function () {
        var date = new Date('Fri Mar 05 2010 14:04:09');
        [
          ['', 'Fri Mar 05 2010 14:04:09'],
          ['d', '03/05/2010'],
          ['D', 'March 05, 2010'],
          ['t', '02:04 PM'],
          ['T', '02:04:09 PM'],
          ['M', '5 March'],
          ['Y', 'March, 2010'],
          ['s', '2010-03-05T14:04:09'],
          ['f', 'March 05, 2010 02:04 PM'],
          ['F', 'March 05, 2010 02:04:09 PM'],
          ['g', '03/05/2010 02:04 PM'],
          ['G', '03/05/2010 02:04:09 PM'],
          ['dddd', 'Friday'],
          ['ddd', 'Fri'],
          ['dd', '05'],
          [' d', ' 5'],
          ['MMMM', 'March'],
          ['MMM', 'Mar'],
          ['MM', '03'],
          [' M', ' 3'],
          ['yyyy', '2010'],
          ['yy', '10'],
          ['HH', '14'],
          ['hh', '02'],
          ['H', '14'],
          ['h', '2'],
          ['mm', '04'],
          ['m', '4'],
          ['ss', '09'],
          [' s', ' 9'],
          ['tt', 'PM']
        ].forEach(
          function (pair) {
            assertSame(date.toString(pair[0]), pair[1]);
          });
      },

      testNumberToString: function () {
        assertSame((42).toString(), '42');
        [
          [42, 16, '2a'],
          [42, 'X', '2A'],
          [42, 'x', '2a'],
          [0.1234, 'g', '0.1234'],
          [12345, 'g', '12345'],
          [1234567, 'n', '1,234,567'],
          [1234567.891, 'c', '$1,234,567.89'],
          [42, 'f', '42.00'],
          [0.1234, 'f', '0.12'],
          [12.34, '000.000', '012.340'],
          [12.34, '#a#b#.#c#d#', 'a1b2.3c4d'],
          [1234567, '0,0', '1,234,567'],
          [1234567, '0,.', '1235'],
          [.1234, '#.###%', '12.34%'],
          [42, 'positive;negative;zero', 'positive'],
          [-42, 'positive;negative;zero', 'negative'],
          [0, 'positive;negative;zero', 'zero']

        ].forEach(
          function (triple) {
            assertSame(triple[0].toString(triple[1]), triple[2]);
          });
      },

      testStringFormat: function () {
        assertSame('{0}'.format(), 'undefined');
        assertSame('{0} {1}'.format(42, 'yo!'), '42 yo!');
        assertSame('{0,-10:0.00}'.format(42), '42.00     ');
        assertSame(
          '{0,11:MMMM yyyy}'.format(new Date('Fri Mar 05 2010 14:04:09')),
          ' March 2010');
        assertSame('{0}'.format(null), 'null');
        assertSame('{{}}'.format(), '{}');
      }
    });
}
