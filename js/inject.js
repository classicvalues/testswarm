/**
 * JavaScript file to included by the test suite page that it loaded
 * inside the iframe on the "run" pages. This injection must be done
 * by the guest page, it can't be loaded by TestSwarm.
 * Example:
 * - https://github.com/jquery/jquery/blob/2.0.0/test/data/testrunner.js
 * - https://github.com/jquery/jquery/blob/2.0.0/test/index.html
 *
 * @author John Resig
 * @author Timo Tijhof
 * @since 0.1.0
 * @package TestSwarm
 */
/* eslint-env browser */
/* global jQuery, QUnit, Test, jasmine, JSSpec, JsUnitTestManager, SeleniumTestResult, LOG, doh, Screw, mocha */
(function() {
	var url, curHeartbeat, testFrameworks, onErrorFnPrev,
		DEBUG = false,
		doPost = false,
		search = location.search,
		index = search.indexOf( "swarmURL=" ),
		submitTimeout = 5,
		beatRate = 20,
		setTimeout = window.setTimeout,
		clearTimeout = window.clearTimeout;

	try {
		doPost = !!window.parent.postMessage;
	} catch ( e ) {
		// Ignore
	}

	if ( index !== -1 ) {
		url = decodeURIComponent( search.slice( index + 9 ) );
	}

	if ( !DEBUG && ( !url || url.indexOf( "http" ) !== 0 ) ) {
		return;
	}

	// Prevent blocking things from executing
	if ( !DEBUG ) {
		window.print = window.confirm = window.alert = window.open = function() {};
	}

	/** Utility functions **/

	function debugObj( obj ) {
		var i, str = "";
		for ( i in obj ) {
			str += ( str ? "\n" : "" ) + i + ":\n\t " + obj[i];
		}
		return str;
	}

	function remove( elem ) {
		if ( typeof elem === "string" ) {
			elem = document.getElementById( elem );
		}

		if ( elem ) {
			elem.parentNode.removeChild( elem );
		}
	}

	function trimSerialize( doc ) {
		var scripts, root, cur, links, i, href;
		doc = doc || document;

		scripts = doc.getElementsByTagName( "script" );
		while ( scripts.length ) {
			remove( scripts[0] );
		}

		root = location.href.replace( /(https?:\/\/.*?)\/.*/, "$1" );
		cur = location.href.replace( /[^/]*$/, "" );

		links = doc.getElementsByTagName( "link" );
		for ( i = 0; i < links.length; i += 1 ) {
			href = links[i].href;
			if ( href.indexOf( "/" ) === 0 ) {
				href = root + href;
			} else if ( !/^https?:\/\//.test( href ) ) {
				href = cur + href;
			}
			links[i].href = href;
		}

		return ( "<html>" + doc.documentElement.innerHTML + "</html>" )
			.replace( /\s+/g, " " );
	}

	function submit( params ) {
		var form, i, input, key, paramItems, parts, query;

		if ( curHeartbeat ) {
			clearTimeout( curHeartbeat );
		}

		paramItems = ( url.split( "?" )[1] || "" ).split( "&" );

		for ( i = 0; i < paramItems.length; i += 1 ) {
			if ( paramItems[i] ) {
				parts = paramItems[i].split( "=" );
				if ( !params[ parts[0] ] ) {
					params[ parts[0] ] = parts[1];
				}
			}
		}

		if ( !params.action ) {
			params.action = "saverun";
		}

		if ( !params.report_html ) {
			params.report_html = window.TestSwarm.serialize();
		}

		if ( DEBUG ) {
			window.alert( debugObj( params ) ) ;
		}

		if ( doPost ) {
			// Build Query String
			query = "";

			for ( key in params ) {
				query += ( query ? "&" : "" ) + key + "=" + encodeURIComponent( params[key] );
			}

			if ( !DEBUG ) {
				window.parent.postMessage( query, "*" );
			}

		} else {
			form = document.createElement( "form" );
			form.action = url;
			form.method = "POST";

			for ( i in params ) {
				input = document.createElement( "input" );
				input.type = "hidden";
				input.name = i;
				input.value = params[i];
				form.appendChild( input );
			}

			if ( DEBUG ) {
				window.alert( url );

			} else {
				// Watch for the result submission timing out
				setTimeout(function() {
					submit( params );
				}, submitTimeout * 1000);

				document.body.appendChild( form );
				form.submit();
			}
		}
	}

	function detectAndInstall() {
		var key;
		for ( key in testFrameworks ) {
			if ( testFrameworks[key].detect() ) {
				testFrameworks[key].install();
				return key;
			}
		}
		return false;
	}

	// Preserve other handlers
	onErrorFnPrev = window.onerror;

	// Cover uncaught exceptions
	// Returning true will suppress the default browser handler,
	// returning false will let it run.
	window.onerror = function( error, filePath, linerNr ) {
		var report,
			ret = false;

		if ( onErrorFnPrev ) {
			ret = onErrorFnPrev( error, filePath, linerNr );
		}

		// Treat return value as window.onerror itself does,
		// Only do our handling if not suppressed.
		if ( ret !== true ) {
			report = document.createElement( "div" );
			report.innerHTML = "<hr/><b>[TestSwarm] window.onerror:</b><br/>";
			report.appendChild( document.createTextNode( error ) );
			report.appendChild( document.createElement( "br" ) );
			report.appendChild( document.createTextNode( "in " + filePath + " on line " + linerNr ) );
			document.body.appendChild( report );
			submit({ fail: 0, error: 1, total: 1 });

			return false;
		}

		return ret;
	};

	// Expose the TestSwarm API
	window.TestSwarm = {
		submit: submit,
		heartbeat: function() {
			if ( curHeartbeat ) {
				clearTimeout( curHeartbeat );
			}

			curHeartbeat = setTimeout(function() {
				submit({
					// ResultAction::STATE_ABORTED
					status: 3
				});
			}, beatRate * 1000);
		},
		serialize: function() {
			return trimSerialize();
		}
	};

	testFrameworks = {
		// QUnit (by jQuery)
		// https://qunitjs.com
		"QUnit": {
			detect: function() {
				return typeof QUnit !== "undefined";
			},
			install: function() {
				QUnit.done(function( results ) {
					submit({
						fail: results.failed,
						error: 0,
						total: results.total
					});
				});

				QUnit.log(window.TestSwarm.heartbeat);
				window.TestSwarm.heartbeat();

				window.TestSwarm.serialize = function() {
					var ol, i;

					// Show any collapsed results
					ol = document.getElementsByTagName( "ol" );
					for ( i = 0; i < ol.length; i += 1 ) {
						ol[i].style.display = "block";
					}

					return trimSerialize();
				};
			}
		},

		// Jasmine v2.x
		// https://jasmine.github.io/
		"Jasmine": {
			detect: function() {
				return typeof jasmine !== "undefined" && typeof describe !== "undefined" && typeof it !== "undefined";
			},
			install: function() {
				var jasmineEnv = jasmine.getEnv(),
					result = {
						fail: 0,
						error: 0,
						total: 0
					};

				jasmineEnv.addReporter({
					jasmineStarted: function( info ) {
						result.total = info.totalSpecsDefined;

						window.TestSwarm.heartbeat();
					},
					suiteStarted: window.TestSwarm.heartbeat,
					specStarted: window.TestSwarm.heartbeat,
					specDone: window.TestSwarm.heartbeat,
					suiteDone: window.TestSwarm.heartbeat,
					jasmineDone: function( info ) {
						result.fail = info.failedExpectations.length;

						submit(result);
					}
				});
			}
		},

		// UnitTestJS (Prototype, Scriptaculous)
		// https://github.com/tobie/unittest_js
		"UnitTestJS": {
			detect: function() {
				return typeof Test !== "undefined" && Test && Test.Unit && Test.Unit.runners;
			},
			install: function() {
				/*jshint loopfunc:true */
				var i,
					total_runners = Test.Unit.runners.length,
					cur_runners = 0,
					total = 0,
					fail = 0,
					error = 0;

				for ( i = 0; i < Test.Unit.runners.length; i += 1 ) {
					// Need to proxy the i variable into a local scope,
					// otherwise all the finish-functions created in this loop
					// will refer to the same i variable..
					(function( i ) {
						var results,
							finish = Test.Unit.runners[i].finish;

						Test.Unit.runners[i].finish = function() {
							finish.call( this );

							results = this.getResult();
							total += results.assertions;
							fail += results.failures;
							error += results.errors;

							cur_runners += 1;
							if ( cur_runners === total_runners ) {
								submit({
									fail: fail,
									error: error,
									total: total
								});
							}
						};
					}( i ) );
				}
			}
		},

		// JSSpec (MooTools)
		// http://jania.pe.kr/aw/moin.cgi/JSSpec
		// https://code.google.com/p/jsspec/
		"JSSpec": {
			detect: function() {
				return typeof JSSpec !== "undefined" && JSSpec && JSSpec.Logger;
			},
			install: function() {
				var onRunnerEnd = JSSpec.Logger.prototype.onRunnerEnd;
				JSSpec.Logger.prototype.onRunnerEnd = function() {
					var ul, i;
					onRunnerEnd.call( this );

					// Show any collapsed results
					ul = document.getElementsByTagName( "ul" );
					for ( i = 0; i < ul.length; i += 1 ) {
						ul[i].style.display = "block";
					}

					submit({
						fail: JSSpec.runner.getTotalFailures(),
						error: JSSpec.runner.getTotalErrors(),
						total: JSSpec.runner.totalExamples
					});
				};

				window.TestSwarm.serialize = function() {
					var i,
						ul = document.getElementsByTagName( "ul" );
					// Show any collapsed results
					for ( i = 0; i < ul.length; i += 1 ) {
						ul[i].style.display = "block";
					}

					return trimSerialize();
				};
			}
		},

		// JSUnit
		// http://www.jsunit.net/
		// Note: Injection file must be included before the frames
		// are document.write()d into the page.
		"JSUnit": {
			detect: function() {
				return typeof JsUnitTestManager !== "undefined";
			},
			install: function() {
				var _done = JsUnitTestManager.prototype._done;
				JsUnitTestManager.prototype._done = function() {
					_done.call( this );

					submit({
						fail: this.failureCount,
						error: this.errorCount,
						total: this.totalCount
					});
				};

				window.TestSwarm.serialize = function() {
					return "<pre>" + this.log.join( "\n" ) + "</pre>";
				};
			}
		},

		// Selenium Core
		// http://seleniumhq.org/projects/core/
		"Selenium": {
			detect: function() {
				return typeof SeleniumTestResult !== "undefined" && typeof LOG !== "undefined";
			},
			install: function() {
				// Completely overwrite the postback
				SeleniumTestResult.prototype.post = function() {
					submit({
						fail: this.metrics.numCommandFailures,
						error: this.metrics.numCommandErrors,
						total: this.metrics.numCommandPasses + this.metrics.numCommandFailures + this.metrics.numCommandErrors
					});
				};

				window.TestSwarm.serialize = function() {
					var msg,
						results = [];
					while ( LOG.pendingMessages.length ) {
						msg = LOG.pendingMessages.shift();
						results.push( msg.type + ": " + msg.msg );
					}

					return "<pre>" + results.join( "\n" ) + "</pre>";
				};
			}
		},

		// Dojo Objective Harness
		// http://docs.dojocampus.org/quickstart/doh
		"DOH": {
			detect: function() {
				return typeof doh !== "undefined" && doh._report;
			},
			install: function() {
				var _report = doh._report;

				doh._report = function() {
					_report.apply( this, arguments );

					submit({
						fail: doh._failureCount,
						error: doh._errorCount,
						total: doh._testCount
					});
				};

				window.TestSwarm.serialize = function() {
					return "<pre>" + document.getElementById( "logBody" ).innerHTML + "</pre>";
				};
			}
		},

		// Screw.Unit
		// https://github.com/nathansobo/screw-unit
		"Screw.Unit": {
			detect: function() {
				return typeof Screw !== "undefined" && typeof jQuery !== "undefined" && Screw && Screw.Unit;
			},
			install: function() {
				/*global $ */
				$( Screw ).bind( "after", function() {
					var	passed = $( ".passed" ).length,
						failed = $( ".failed" ).length;
					submit({
						fail: failed,
						error: 0,
						total: failed + passed
					});
				});

				$( Screw ).bind( "loaded", function() {
					$( ".it" )
						.bind( "passed", window.TestSwarm.heartbeat )
						.bind( "failed", window.TestSwarm.heartbeat );
					window.TestSwarm.heartbeat();
				});

				window.TestSwarm.serialize = function() {
					return trimSerialize();
				};
			}
		},

		// Mocha
		// https://mochajs.org/
		"Mocha": {
			detect: function() {
				return typeof Mocha !== "undefined" && typeof mocha !== "undefined";
			},
			install: function() {
				// Tab into the run method to install our hooks.
				// Use the mocha instance instead of the prototype, because
				// the mocha instance (HTMLReporter) also overloads .run.
				// This ensures our code runs after HTMLReporter is done.
				var run = mocha.run;
				mocha.run = function(fn) {
					var runner;

					// Sometimes (in IE9?) the 'end' event has already fired.
					// Registering on("end", fn) afterwards doesn't work.
					// So we use the .run(fn) callback instead, which is called
					// internally by Mocha right after the 'end' event.
					runner = run.call(this, function() {
						if (fn) {
							// Call the original callback given to .run(fn)
							fn.apply(this, arguments);
						}
						// `runner` can sometimes still be undefined here (at least in IE9).
						// Let the function return and pick up asynchronously
						// so the variable has been assigned.
						setTimeout(function() {
							submit({
								fail: runner.failures,
								total: runner.total,
								error: 0
							});
						}, 1);
					});

					runner.on("start", window.TestSwarm.heartbeat);
					runner.on("suite", window.TestSwarm.heartbeat);
					runner.on("test end", window.TestSwarm.heartbeat);
					runner.on("pass", window.TestSwarm.heartbeat);
					runner.on("fail", window.TestSwarm.heartbeat);

					return runner;
				};

				window.TestSwarm.serialize = function() {
					var i, len, els;
					els = document.getElementsByTagName("pre");
					// Expand all source code sections, because we submit a static
					// snapshot to TestSwarm, event handlers don"t survive.
					for ( i = 0, len = els.length; i < len; i++ ) {
						els[i].style.display = "inline-block";
					}
					return trimSerialize();
				};
			}
		}
	};

	detectAndInstall();

}() );
