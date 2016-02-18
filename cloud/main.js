var brokerToken = '218dd930cb7a5c262609f3c1d5ae5d6b';
var blockApiKey = '3e52-13d3-b3c7-c2b6';
var blockApiPin = '1M4U9L7E7N';
var parseAppId = 'sObeqCovKFUbZMYfpN6983oY0cWAJuaBllOx3NWT';
var parseJavascriptKey = 'A9B4W8RRwSEjhKx7cMhmJR60Rk72sKCOOqrgVVCD';
var btcJamAddress = '';

var bfxKey = '2RQMxsIkfukQ7j185DNW69G9ifYD7f6N57gsSM3yvp1';
var bfxSecret = 'uln3fVnMWf3TjnlfrpMgLH1y3JaIy3ejlphMLwIIYtg';
var bfxURL = "https://api.bitfinex.com/v1"

var Buffer = require('buffer').Buffer;
var Crypto = require('crypto');

// + tx_hook = 3 > create assets > set_prices
// move_funds
// place_orders

//  User - For new users, create them an address and set up a webhook notification on that address.
Parse.Cloud.afterSave('_User', function(request) {
  Parse.Cloud.useMasterKey();
  if (request.object.updatedAt.getTime() == request.object.createdAt.getTime()) {
    var user = request.object;
    var complete = user.get('complete');
    var portfolio = user.get('portfolio');
    portfolio.fetch({
      success: function(fetchedPortfolio) {
        var symbols = fetchedPortfolio.get('symbols');
        var weights = fetchedPortfolio.get('weights');
        user.set('symbols', symbols);
        user.set('weights', weights);
        user.save(null, {
          success: function(savedUser) {
            Parse.Cloud.httpRequest({
              url: 'https://block.io/api/v2/get_new_address/?api_key='+blockApiKey,
              success: function (walletResponse) {
                var walletData = JSON.parse(walletResponse.text);
                var network = walletData.data.network;
                var userId = walletData.data.user_id;
                var address = walletData.data.address;
                var label = walletData.data.label;
                var WalletClass = Parse.Object.extend('Wallet');
                var wallet = new WalletClass();
                wallet.set('network', network);
                wallet.set('userId', userId);
                wallet.set('address', address);
                wallet.set('label', label);
                wallet.set('user', user);
                wallet.save();
                user.set('address', address);
                user.set('wallet', wallet);
                user.save();
                console.log('got wallet: '+address);
                Parse.Cloud.httpRequest({
                  url: 'https://block.io/api/v2/create_notification/?api_key='+blockApiKey+'&type=address&address='+walletData.data.address+'&url=https://'+parseAppId+':javascript-key%3D'+parseJavascriptKey+'@api.parse.com/1/functions/tx_hook',
                  success: function (notificationResponse) {
                    var notificationData = JSON.parse(notificationResponse.text);
                    var network = notificationData.data.network;
                    var notificationId = notificationData.data.notification_id;
                    var type = notificationData.data.type;
                    var enabled = notificationData.data.enabled;
                    var url = notificationData.data.url;
                    wallet.set('network', network);
                    wallet.set('notificationId', notificationId);
                    wallet.set('type', type);
                    wallet.set('enabled', enabled);
                    wallet.set('url', url);
                    wallet.set('user', user);
                    wallet.save();
                    user.set('complete', true);
                    user.save(null, {
                      success: function(savedUser) {
                        var EventClass = Parse.Object.extend('Event');
                        var accountEvent = new EventClass();
                        accountEvent.set('user', user);
                        accountEvent.set('detail', user.get('email'));
                        accountEvent.set('name', 'New Account Created');
                        accountEvent.set('type', 'account');
                        accountEvent.set('read', false);
                        accountEvent.set('progress', parseFloat(1));
                        accountEvent.save();
                        console.log('added wallet notification: '+notificationId);
                      }, error: function(error) {
                        console.error('error saving user '+error.text);
                      }
                    });

                  },
                  error: function (error) {
                    console.error('error creating notification '+error.text);
                  }
                });
              },
              error: function (error) {
                console.error('wallet create failed: '+error.text);
              }
            });
          }, error: function(error) {
            console.error('error saving user '+error.text);
          }
        });
      }, error: function(fetchedPortfolio, error) {
        console.error('error fetching portfolio '+error.text);
      }
    });
  } else {
    console.log('user already saved');
  };
});

Parse.Cloud.define('current_value', function(request, response) {
  var UserClass = Parse.Object.extend(Parse.User);
  var userQuery = new Parse.Query(UserClass);
  userQuery.equalTo('objectId', request.params['userId']);
  userQuery.first({
    success: function(user) {
      var AssetClass = Parse.Object.extend('Asset');
      var assetsQuery = new Parse.Query(AssetClass);
      assetsQuery.equalTo('user', user);
      assetsQuery.find({
        success: function (assets) {
          var values = [];
          var totalValue = 0;
          if (assets) {
            var symbols = [];
            var assetsDict = {};
            assets.forEach(function(asset, index) {
              var symbol = asset.get('symbol');
              if (symbol != 'BTCJ') {
                symbols.push(symbol);
              };
              if (!(assetsDict.hasOwnProperty(symbol))) {
                assetsDict[symbol] = [asset];
              } else {
                var assetsArray = assetsDict[symbol];
                assetsArray.push(asset);
                assetsDict[symbol] = assetsArray;
              };
            });
            var getQuoteURL = 'https://1broker.com/api/v1/market/quotes.php?symbols='+symbols.toString()+'&token='+brokerToken;
            Parse.Cloud.httpRequest({
              url: getQuoteURL,
              success: function (getQuoteResponse) {
                var quotes = getQuoteResponse.data.response;
                if (quotes) {
                  var btcjTime;
                  quotes.forEach(function(quote, index) {
                    console.log('quote: '+quote['bid']);
                    var bid = quote['bid'];
                    var quoteSymbol = quote['symbol'];
                    var time = Date.parse(quote['updated']) / 1000;
                    if (quoteSymbol == 'SP500') {
                      btcjTime = time;
                    }
                    var margin = 0;
                    var value = 0;
                    var symbolAssets = assetsDict[quoteSymbol];
                    console.log(symbolAssets);
                    symbolAssets.forEach(function(rangeAsset, index) {
                      var date = rangeAsset.get('createdAt');
                      var utc1970 = parseInt((date.getTime()).toString().slice(0,-3));
                      var amount = rangeAsset.get('amount');
                      console.log('amount: '+amount);
                      margin = margin + amount;
                      // if (utc1970 < time) {
                        var price = rangeAsset.get('price');
                        value = value + ((amount * bid) / price);
                      // };
                    });
                    if (!value) {
                      value = margin;
                    };
                    var change = 0;
                    if (margin > 0) {
                      change = ((value - margin) / margin) * 100;
                    };
                    values.push(value);
                    totalValue += value;
                  });
                  var assetValue = 0;
                  var BTCJamClass = Parse.Object.extend('BTCJam');
                  var BTCJamQuery = new Parse.Query(BTCJamClass);
                  BTCJamQuery.exists('return');
                  BTCJamQuery.find({
                    success: function(portfolio) {
                      var object = portfolio[0];
                      var returnData = object.get('return');
                      var btcjMargin = 0;
                      assetsDict['BTCJ'].forEach(function(rangeAsset, index) {
                        var btcjValue = 0;
                        var date = rangeAsset.get('createdAt');
                        var amount = rangeAsset.get('amount');
                        var utcCreated = parseInt((date.getTime()).toString().slice(0,-3));
                        btcjMargin = btcjMargin + amount;
                        var base = (1+(returnData*1000000)/(1*1000000));
                        var exponent = ((btcjTime - utcCreated)/(86400000*365));
                        var exponentTop = (btcjTime - utcCreated);
                        var exponentBottom = (86400000*365);
                        var pow = Math.pow(base, exponent);
                        var powerWithP = amount * pow;
                        btcjValue = btcjValue + powerWithP;
                        assetValue = assetValue + btcjValue;
                      });
                      values.push(assetValue);
                      totalValue += assetValue;
                      response.success({
                        'values' : values,
                        'total' : totalValue,
                      });
                    }, error: function(error) {
                      response.error('error: ' + error.message);
                    }
                  });
                } else {
                  response.success({
                    'values' : {},
                    'total' : 0,
                  });
                }
              }, error: function (error) {
                response.error('error getting quote: ' + error.message);
              }
            });
          } else {
            response.success({
              'values' : values,
              'total' : totalValue,
            });
          };
        }, error: function (error) {
          response.error('error: ' + error.message);
        }
      });
    }, error: function(error) {
      console.error('error querying user '+error.text);
    }
  });
});

//  Returns a specific time range of historic data for a given asset
//  request ex: {"userId":"9daVxo8WKt","symbol":"BTCUSD","from":"1448549083","to":"1450030240","resolution":"3600"}
Parse.Cloud.define('asset_bars', function(request, response) {
  var UserClass = Parse.Object.extend(Parse.User);
  var user = new UserClass();
  user.id = request.params['userId'];
  var symbol = request.params['symbol'];
  var from = request.params['from'];
  var to = request.params['to'];
  var resolution = request.params['resolution'];
  if (symbol != 'BTCJ') {
    var getBarsURL = 'https://1broker.com/api/v1/market/get_bars.php?symbol='+symbol+'&from='+from+'&to='+to+'&resolution='+resolution+'&token='+brokerToken;
    Parse.Cloud.httpRequest({
      url: getBarsURL,
      success: function (getBarsResponse) {
        var bars = getBarsResponse.data.response;
        var AssetClass = Parse.Object.extend('Asset');
        var assetsQuery = new Parse.Query(AssetClass);
        assetsQuery.equalTo('user', user);
        assetsQuery.equalTo('symbol', symbol);
        assetsQuery.find({
          success: function (assets) {
            if (bars.length > 0) {
              var start = bars[0]['time'];
              var end = bars[bars.length-1]['time'];
              var margins = [];
              var values = [];
              var dates = [];
              var assetBars = [];
              bars.forEach(function(bar, index) {
                var time = bar['time'];
                var close = bar['c'];
                var margin = 0;
                var value = 0;
                var assetBar = {};
                assets.forEach(function(rangeAsset, index) {
                  var date = rangeAsset.get('createdAt');
                  var utc1970 = parseInt((date.getTime()).toString().slice(0,-3));
                  var amount = parseFloat(rangeAsset.get('amount'));
                  if (utc1970 < time && utc1970 < end) {
                    margin += amount;
                    var price = rangeAsset.get('price');
                    value += parseFloat((amount * close) / price); // Using close... could be any of OHLC
                  } else {
                    margin += amount;
                    value += amount;
                  };
                });
                // if (!value) {
                //   value = margin;
                // };
                var change = 0;
                if (margin > 0) {
                  change = ((value - margin) / margin) * 100;
                };
                assetBar['margin'] = margin;
                assetBar['value'] = value;
                assetBar['time'] = time;
                assetBar['change'] = change;
                assetBar['price'] = close;
                assetBars.push(assetBar);
              });
              response.success({
                'barCount' : bars.length,
                'start' : start,
                'end' : end,
                'assetBars' : assetBars,
                'symbol' : symbol
              });
            } else {
              var getQuoteURL = 'https://1broker.com/api/v1/market/quotes.php?symbols='+symbol+'&token='+brokerToken;
              Parse.Cloud.httpRequest({
                url: getQuoteURL,
                success: function (getQuoteResponse) {
                  var quotes = getQuoteResponse.data.response;
                  var quote = quotes[0];
                  console.log('quote: '+quote['bid']);
                  var bid = quote['bid'];
                  var quoteSymbol = quote['symbol'];
                  var time = Date.parse(quote['updated']) / 1000;
                  var margin = 0;
                  var value = 0;
                  var assetBars = [];
                  var assetBar = {};
                  assets.forEach(function(rangeAsset, index) {
                    var date = rangeAsset.get('createdAt');
                    var utc1970 = parseInt((date.getTime()).toString().slice(0,-3));
                    var amount = parseFloat(rangeAsset.get('amount'));
                    margin += amount;
                    // if (utc1970 < time) {
                      // margin = margin + amount;
                      var price = rangeAsset.get('price');
                      value += parseFloat((amount * bid) / price);
                    // };
                  });
                  if (value == 0) {
                    value = parseFloat(margin);
                  };
                  var change = 0;
                  if (margin > 0) {
                    change = ((value - margin) / margin) * 100;
                  };
                  assetBar['margin'] = margin;
                  assetBar['value'] = value;
                  assetBar['time'] = time;
                  assetBar['change'] = change;
                  assetBar['price'] = bid;
                  assetBars.push(assetBar);
                  response.success({
                    'barCount' : bars.length,
                    'start' : time,
                    'end' : time,
                    'assetBars' : assetBars,
                    'symbol' : quoteSymbol
                  });
                }, error: function (error) {
                  response.error('error getting quote: ' + error.message);
                }
              });
            };
          }, error: function (error) {
            response.error('error: ' + error.message);
          }
        });
      }, error: function (error) {
        response.error('error: ' + error.message);
      }
    });
  } else {
    Parse.Cloud.run("btcj_asset_bars", request.params, {
      success: function (jamBars) {
        response.success(jamBars);
      }, error: function (error) {
        response.error(error);
      }
    });
  };
});

//  Called by block.io remotely to indicate a change at any of our user deposit addresses
Parse.Cloud.define('tx_hook', function(request, response) {
  Parse.Cloud.useMasterKey();
  var transactionData = request.params;
  if (transactionData.data) {
    var notificationId = transactionData.notification_id;
    var deliveryAttempt = transactionData.delivery_attempt;
    var confirmations = transactionData.data.confirmations;
    var address = transactionData.data.address;
    var amountReceived = transactionData.data.amount_received;
    var amountSent = transactionData.data.amount_sent;
    var balanceChange = transactionData.data.balance_change;
    var network = transactionData.data.network;
    var transactionId = transactionData.data.txid;
    var sentAt = transactionData.created_at;
    var TransactionClass = Parse.Object.extend('Transaction');
    var transactionQuery = new Parse.Query(TransactionClass);
    transactionQuery.equalTo('transactionId', transactionId);
    transactionQuery.find({
      success: function (transactions) {
        if(transactions.length === 0) {
          var UserClass = Parse.Object.extend(Parse.User);
          var userQuery = new Parse.Query(UserClass);
          userQuery.equalTo('address', address);
          userQuery.first({
            success: function (user) {
              var transaction = new TransactionClass();
              if (user) {
                transaction.set('user', user);
              }
              transaction.set('notificationId', notificationId);
              transaction.set('deliveryAttempt', deliveryAttempt);
              transaction.set('confirmations', parseFloat(confirmations));
              transaction.set('address', address);
              transaction.set('amountReceived', parseFloat(amountReceived));
              transaction.set('amountSent', parseFloat(amountSent));
              transaction.set('balanceChange', parseFloat(balanceChange));
              transaction.set('network', network);
              transaction.set('transactionId', transactionId);
              transaction.set('complete', false);
              transaction.set('sentAt', sentAt);
              transaction.save();
              response.success('saved new transaction: '+transactionId);
            }, error: function (error) {
              var transaction = new TransactionClass();
              transaction.set('notificationId', notificationId);
              transaction.set('deliveryAttempt', deliveryAttempt);
              transaction.set('confirmations', parseFloat(confirmations));
              transaction.set('address', address);
              transaction.set('amountReceived', parseFloat(amountReceived));
              transaction.set('amountSent', parseFloat(amountSent));
              transaction.set('balanceChange', parseFloat(balanceChange));
              transaction.set('network', network);
              transaction.set('transactionId', transactionId);
              transaction.set('complete', false);
              transaction.set('sentAt', sentAt);
              transaction.save();
              response.success('saved new transaction (without user): '+transactionId);
            }
          });
        } else {
          var transaction = transactions[0];
          transaction.set('amountReceived', parseFloat(amountReceived));
          transaction.set('amountSent', parseFloat(amountSent));
          transaction.set('balanceChange', parseFloat(balanceChange));
          transaction.set('confirmations', confirmations);
          transaction.set('address', address);
          transaction.save();
          var complete = transaction.get('complete');
          if (balanceChange > 0) {
            if (confirmations == 3 && complete == false) {
              var UserClass = Parse.Object.extend(Parse.User);
              var userQuery = new Parse.Query(UserClass);
              userQuery.equalTo('address', address);
              userQuery.first({
                success: function (user) {
                  var symbols = user.get('symbols');
                  var weights = user.get('weights');
                  var AssetClass = Parse.Object.extend('Asset');
                  var assets = [];
                  symbols.forEach(function(symbol, index) {
                    var weight = weights[index];
                    var amount = balanceChange * weight;
                    var asset = new AssetClass();
                    asset.set('amount', parseFloat(amount.toFixed(7)));
                    asset.set('symbol', symbol);
                    asset.set('user', user);
                    asset.set('complete', false);
                    asset.set('inTransaction', transaction);
                    assets.push(asset);
                  });
                  Parse.Object.saveAll(assets, {
                    success: function (savedAssets) {
                      transaction.set('complete', true);
                      transaction.set('user', user);
                      transaction.save();
                      Parse.Cloud.run("set_prices", {}, {
                        success: function (pricesSet) {
                          response.success(pricesSet);
                        }, error: function (error) {
                          response.error(error);
                        }
                      });
                    },
                    error: function (error) {
                      response.error('error saving assets: '+error.message);
                    }
                  });
                }, error: function (error) {
                  response.error('error querying user: '+error.code+' '+error.message);
                }
              });
            } else {
              response.success('updated transaction: '+transactionId);
            };
          } else {
            if (confirmations == 3 && !complete) {
              response.success('forward transaction complete');
              // var AssetClass = Parse.Object.extend('Asset');
              // var assetQuery = new Parse.Query(AssetClass);
              // assetQuery.equalTo('outTransaction', transaction);
              // assetQuery.find({
              //   success: function(assets) {
              //     var firstAsset = assets[0];
              //     var symbol = firstAsset.get('symbol');
              //     if (symbol != 'BTCJ') {
              //       console.log('broker transaction is: ' + transaction.id + ', amount: ' + balanceChange);
              //       transaction.set('complete', true);
              //       transaction.save();
              //       Parse.Cloud.run("place_orders", {}, {
              //         success: function (result) {
              //           assets.forEach(function(asset, index) {
              //             asset.set(complete, true);
              //           });
              //           Parse.Object.saveAll(assets, {
              //             success: function (savedAssets) {
              //               response.success('orders placed, assets completed: '+ assets.length);
              //             }, error: function(error) {
              //               response.success('ummm placed orders but assets save failed');
              //             }
              //           });
              //         }, error: function (error) {
              //           response.error(error);
              //         }
              //       });
              //     } else {
              //       response.success('tx symbol is btcj');
              //     }
              //   }, error: function (error) {
              //     response.error('error querying assets: '+error.code+' '+error.message);
              //   }
              // });
            } else {
              response.success('updated forward transaction');
            };
          };
        };
      },
      error: function (error) {
        response.error('error querying transactions: '+error.code+' '+error.message);
      }
    });
  } else {
    response.success('ping success');
  };
});

Parse.Cloud.afterSave('Transaction', function(request) {
  Parse.Cloud.useMasterKey();
  var transaction = request.object;
  var value = parseFloat(transaction.get('balanceChange'));
  if (value > 0) {
    var progress = parseFloat(transaction.get('confirmations')/3);
    // if (progress ) {
    //
    // }
    var alert = 'Deposit Received';
    var name = 'New Deposit';
    if (progress >= 1) {
      alert = 'Deposit Complete';
      name = 'Completed Deposit'
    } else if (progress > 0)  {
      alert = 'deposit updated';
      name = 'Deposit in Progress'
    };
    var EventClass = Parse.Object.extend('Event');
    var eventQuery = new Parse.Query(EventClass);
    eventQuery.equalTo('transaction', transaction);
    eventQuery.first({
      success: function (eventObject) {
        var user = transaction.get('user');
        if (eventObject) {
          eventObject.set('progress', progress);
          eventObject.set('alert', alert);
          eventObject.set('name', alert);
          eventObject.save();
        } else {
          var newEvent = new EventClass();
          newEvent.set('transaction', transaction);
          newEvent.set('progress', progress);
          newEvent.set('type', 'deposit');
          newEvent.set('name', name);
          newEvent.set('value', value);
          newEvent.set('read', false);
          newEvent.set('alert', alert);
          newEvent.set('user', user);
          newEvent.save();
        };
        var userQuery = new Parse.Query(Parse.User);
        userQuery.equalTo('objectId', user.id);
        var pushQuery = new Parse.Query(Parse.Installation);
        pushQuery.matchesQuery('user', userQuery);
        Parse.Push.send({
          where: pushQuery,
          data: {
            alert : {
              'title' : name,
              'body' : alert,
              'type' : 'deposit'
            }
          }
        }, {
          success: function() {
            console.log('push success: ');
          },
          error: function(error) {
            console.log('push error: '+error);
          }
        });
      }, error: function (error) {
        console.error('error querying events: ' + error);
      }
    });
  }
});

Parse.Cloud.define('test_push', function(request, response) {
  var userQuery = new Parse.Query(Parse.User);
  userQuery.equalTo('objectId', 'qT6DdHYgrA');
  var pushQuery = new Parse.Query(Parse.Installation);
  pushQuery.matchesQuery('user', userQuery);
  Parse.Push.send({
    where: pushQuery,
    data: {
      alert : {
        'title' : 'test',
        'body' : 'body',
        'type' : 'deposit'
      }
    }
  }, {
    success: function() {
      response.success('test success');
    },
    error: function(error) {
      response.error(error);
    }
  });
});

//  Sums up all assets sans transaction, and moves funds appropriately
Parse.Cloud.job('move_funds', function(request, response) {
  Parse.Cloud.useMasterKey();
  var assetTotals = {};
  var brokerTotal = 0;
  var bfxTotal = 0;
  var AssetClass = Parse.Object.extend('Asset');
  var assetQuery = new Parse.Query(AssetClass);
  assetQuery.doesNotExist('outTransaction');
  assetQuery.greaterThan('amount', 0);
  assetQuery.find({
    success: function (assets) {
      assets.forEach(function (asset, index) {
        var symbol = asset.get('symbol');
        var margin = asset.get('amount');
        if (!(assetTotals.hasOwnProperty(symbol))) {
          assetTotals[symbol] = margin;
        } else {
          assetTotals[symbol] = assetTotals[symbol] + margin;
        };
        if (symbol == 'BTCJ') {
          bfxTotal += margin;
        } else {
          brokerTotal += margin;
        };
      });
      //  Send to Broker
      if (brokerTotal > 0) {
        Parse.Cloud.httpRequest({
          url: 'https://1broker.com/api/v1/account/bitcoin_deposit_address.php?token='+brokerToken+'&pretty=1',
          success: function (addressResponse) {
            var brokerAddress = addressResponse.data.response.bitcoin_deposit_address;
            var brokerWithdraw = {
              'toAddress' : brokerAddress,
              'amount' : parseFloat(brokerTotal.toFixed(7))
            }
            var brokerTransaction;
            Parse.Cloud.run('blockio_withdraw', brokerWithdraw, {
              success: function (brokerWithdrawSuccess) {
                brokerTransaction = brokerWithdrawSuccess['transaction'];
                assets.forEach(function (asset, index) {
                  var assetSymbol = asset.get('symbol');
                  if (assetSymbol != 'BTCJ') {
                    asset.set('outTransaction', brokerTransaction);
                    asset.set('type' , 'broker');
                  }
                });
                Parse.Object.saveAll(assets, {
                  success: function (savedAssets) {
                    response.success('moved funds for '+ savedAssets.length + ' assets, transaction: '+brokerTransaction.id);
                  },
                  error: function (error) {
                    response.error('error saving assets: ' + error.message);
                  }
                });
              }, error: function (error) {
                response.error(error);
              }
            });
          }, error: function (error) {
            response.error('error getting broker address: '+error.code+' '+error.message);
          }
        });
      } else {
        response.success('no asset funds to move: '+ brokerTotal);
      }
    }, error: function (error) {
      response.error('error querying assets: '+error.code+' '+error.message);
    }
  });
});

Parse.Cloud.job('bfx_move_funds', function(request, response) {
  Parse.Cloud.useMasterKey();
  var assetTotals = {};
  var brokerTotal = 0;
  var bfxTotal = 0;
  var AssetClass = Parse.Object.extend('Asset');
  var assetQuery = new Parse.Query(AssetClass);
  assetQuery.doesNotExist('outTransaction');
  assetQuery.greaterThan('amount', 0);
  assetQuery.find({
    success: function (assets) {
      assets.forEach(function (asset, index) {
        var symbol = asset.get('symbol');
        var margin = asset.get('amount');
        if (!(assetTotals.hasOwnProperty(symbol))) {
          assetTotals[symbol] = margin;
        } else {
          assetTotals[symbol] = assetTotals[symbol] + margin;
        };
        if (symbol == 'BTCJ') {
          bfxTotal += margin;
        } else {
          brokerTotal += margin;
        };
      });
      if (bfxTotal > 0.00005) {
        Parse.Cloud.run('bfx_address', {}, {
          success: function (address) {
            var bfxAddress = address.address;
            var bfxWithdraw = {
              'toAddress' : bfxAddress,
              'amount' : parseFloat(bfxTotal.toFixed(7))
            }
            var bfxTransaction;
            Parse.Cloud.run('blockio_withdraw', bfxWithdraw, {
              success: function (bfxWithdrawSuccess) {
                bfxTransaction = bfxWithdrawSuccess['transaction'];
                assets.forEach(function (asset, index) {
                  var assetSymbol = asset.get('symbol');
                  if (assetSymbol == 'BTCJ') {
                    asset.set('outTransaction', bfxTransaction);
                    asset.set('type', 'bfx');
                  }
                });
                Parse.Object.saveAll(assets, {
                  success: function (savedAssets) {
                    response.success('moved funds for '+ savedAssets.length + ' assets, transaction: '+bfxTransaction.id);
                  },
                  error: function (error) {
                    console.log('error saving assets: ' + error.message);
                    response.success();
                  }
                });
              }, error: function (error) {
                // console.log();
                response.error('error withdrawing to bitfinex');
              }
            });
          }, error: function (error) {
            // console.log();
            response.error('error getting bfx address');
          }
        });
      } else {
        response.success('no bfx asset funds to move');
      }
    }, error: function (error) {
      response.error('error querying assets: '+error.code+' '+error.message);
    }
  });
});

// Looks for unpriced assets, and fills in with latest quote. Also produces total to pass forward
Parse.Cloud.define('set_prices', function(request, response) {
  Parse.Cloud.useMasterKey();
  var symbolTotals = {};  // Total bitcoin per symbol
  var uniqueSymbols = [];
  var total = 0;  // Total bitcoin
  var AssetClass = Parse.Object.extend('Asset');
  var assetQuery = new Parse.Query(AssetClass);
  assetQuery.doesNotExist('price');
  assetQuery.find({
    success: function (assets) {
      // Get unique symbols (and totals, for buying later maybe)
      assets.forEach(function(asset, index) {
        var symbol = asset.get('symbol');
        var margin = asset.get('amount');
        total = total + margin;
        if (!(symbolTotals.hasOwnProperty(symbol))) {
          symbolTotals[symbol] = margin;
          uniqueSymbols.push(symbol);
        } else {
          symbolTotals[symbol] = symbolTotals[symbol] + margin;
        };
      });
      // Get quotes for unique symbols (max 20 unique symbols!)
      Parse.Cloud.httpRequest({
        url: 'https://1broker.com/api/v1/market/quotes.php?symbols='+uniqueSymbols.toString()+'&token='+brokerToken+'&pretty=1',
        success: function (quotes) {
          if (quotes.data.response) {
            var quotesArray = quotes.data.response;
            var prices = {};
            assets.forEach(function(asset, index) {
              var symbol = asset.get('symbol');
              var margin = asset.get('amount');
              quotesArray.forEach(function(quote, index){
                if (symbol === quote.symbol) {
                  var price;
                  if (margin > 0) {
                    price = quote.ask;
                  } else {
                    price = quote.bid;
                  };
                  prices[symbol] = price;
                  asset.set('price', parseFloat(price));
                };
              });
            });
            Parse.Object.saveAll(assets, {
              success: function (savedAssets) {
                response.success({
                  'prices' : prices,
                  'symbolTotals': symbolTotals,
                  'total' : total
                });
              },
              error: function (error) {
                response.error('error saving assets: '+error.message);
              }
            });
          } else {
            response.error('error getting quotes: '+uniqueSymbols.toString());
          };
        }, error: function (error) {
          response.error('error getting quotes: '+error.code+' '+error.message);
        }
      });
    }, error: function (error) {
      response.error('error querying assets: '+error.code+' '+error.message);
    }
  });
});

// Orders any assets matching the given transaction id
Parse.Cloud.job('place_orders', function(request, response) {
  Parse.Cloud.useMasterKey();
  var assetTotals = {};
  var AssetClass = Parse.Object.extend('Asset');
  var assetQuery = new Parse.Query(AssetClass);
  assetQuery.exists('outTransaction');
  assetQuery.equalTo('complete', false);
  assetQuery.greaterThan('amount', 0);
  assetQuery.notEqualTo('symbol', 'BTCJ');
  assetQuery.find({
    success: function (assets) {
      if (assets.length > 0) {
        assets.forEach(function (asset, index) {
          var symbol = asset.get('symbol');
          var margin = asset.get('amount');
          if (!(assetTotals.hasOwnProperty(symbol))) {
            assetTotals[symbol] = margin;
          } else {
            assetTotals[symbol] = assetTotals[symbol] + margin;
          };
        });
        var finishedCount = 0;  //  Keep track of finished order attempts
        var orderIds = [];
        var orderSymbols = [];
        for (var totalSymbol in assetTotals) {
          var margin = assetTotals[totalSymbol];
          Parse.Cloud.httpRequest({
            url: 'https://1broker.com/api/v1/order/create.php?symbol='+totalSymbol+'&margin='+margin+'&direction=long&leverage=1&order_type=Market&token='+brokerToken+'&pretty=1',
            success: function (orderResponse) {
              if (JSON.parse(orderResponse.text)["error"] != true) {
                var orderId = orderResponse.data.response.order_id;
                var orderSymbol = orderResponse.data.response.symbol;
                orderIds.push(orderId);
                orderSymbols.push(orderSymbol);
                assets.forEach(function (asset, index) {
                  var assetSymbol = asset.get('symbol');
                  if (orderSymbol == assetSymbol) {
                    asset.set('complete', true);
                    asset.set('orderId', orderId);
                  };
                });
                finishedCount = finishedCount + 1;
                if (finishedCount == Object.keys(assetTotals).length) {
                  Parse.Object.saveAll(assets, {
                    success: function (savedAssets) {
                      response.success('placed '+ orderIds.length +' orders, for ' + savedAssets.length + ' assets');
                    },
                    error: function (assetSaveError) {
                      response.error('error saving assets: '+assetSaveError.message);
                    }
                  });
                };
              } else {
                // console.log('order failed - totalSymbol: ' + totalSymbol + ', margin: ' + margin);
                finishedCount = finishedCount + 1;
                if (finishedCount == Object.keys(assetTotals).length) {
                  Parse.Object.saveAll(assets, {
                    success: function (savedAssets) {
                      response.success('placed '+ orderIds.length +' orders, for ' + savedAssets.length + ' assets');
                    },
                    error: function (assetSaveError) {
                      response.error('error saving assets: '+assetSaveError.message);
                    }
                  });
                };
              };
            }, error: function (orderError) {
              finishedCount = finishedCount + 1;
              if (finishedCount == Object.keys(assetTotals).length) {
                Parse.Object.saveAll(assets, {
                  success: function (savedAssets) {
                    response.success('placed '+ orderIds.length +' orders, for ' + savedAssets.length + ' assets');
                  },
                  error: function (assetSaveError) {
                    response.error('error saving assets: '+assetSaveError.message);
                  }
                });
              };
            }
          });
        }
      } else {
        response.success('no assets to order');
      }
    }, error: function (assetQueryError) {
      response.error('error querying assets: '+assetQueryError.code+' '+assetQueryError.message);
    }
  });
});

Parse.Cloud.define('coinbase_hook', function(request, response) {
  response.success();
});

Parse.Cloud.afterSave('Withdraw', function(request) {
  Parse.Cloud.useMasterKey();

});

Parse.Cloud.define('withdraw_amount', function(request, response) {
  Parse.Cloud.useMasterKey();
  var amount = request.params['amount'];
  var toAddress = request.params['toAddress'];
  var UserClass = Parse.Object.extend(Parse.User);
  var user = new UserClass();
  user.id = request.params['userId'];
  user.fetch({
    success: function (fetchedUser) {
      Parse.Cloud.run('current_value', {'userId' : fetchedUser.id}, {
        success: function(currentValue) {
          var total = currentValue.total;
          if (amount <= total) {
            var symbols = fetchedUser.get('symbols');
            var weights = fetchedUser.get('weights');
            var symbolAmounts = {};
            var totalAmount = 0;
            symbols.forEach(function (symbol, index) {
              var weight = weights[index];
              var symbolAmount = amount * weight;
              totalAmount += symbolAmount;
              symbolAmounts[symbol] = symbolAmount;
            });
            var withdraw = {
              'amount' : parseFloat(totalAmount.toFixed(7)),
              'toAddress' : toAddress
            };
            Parse.Cloud.run('coinbase_withdraw', withdraw, {
              success: function (coinbaseWithdraw) {
                var transactionId = coinbaseWithdraw.txn.id
                var newAssets = [];
                var AssetClass = Parse.Object.extend('Asset');
                symbols.forEach(function (symbol, index) {
                  var asset = new AssetClass();
                  asset.set('amount', (-parseFloat(symbolAmounts[symbol].toFixed(7))));
                  asset.set('symbol', symbol);
                  asset.set('user', user);
                  asset.set('complete', false);
                  asset.set('coinbaseTransaction', transactionId);
                  newAssets.push(asset);
                });
                Parse.Object.saveAll(newAssets, {
                  success: function (savedAssets) {
                    var EventClass = Parse.Object.extend('Event');
                    var newEvent = new EventClass();
                    newEvent.set('coinbaseTransaction', transactionId);
                    newEvent.set('progress', 1);
                    newEvent.set('type', 'withdrawal');
                    newEvent.set('name', 'Withdrawal');
                    newEvent.set('value', parseFloat(-totalAmount.toFixed(7)));
                    newEvent.set('read', false);
                    newEvent.set('alert', 'Withdraw Complete');
                    newEvent.set('user', user);
                    newEvent.save(null,{
                      success: function (savedEvent) {
                        Parse.Cloud.run("set_prices", {}, {
                          success: function (setPrices) {
                            var userQuery = new Parse.Query(Parse.User);
                            userQuery.equalTo('objectId', user.id);
                            var pushQuery = new Parse.Query(Parse.Installation);
                            pushQuery.matchesQuery('user', userQuery);
                            Parse.Push.send({
                              where: pushQuery,
                              data: {
                                alert : {
                                  'title' : 'Withdrawal',
                                  'body' : 'Withdraw Complete',
                                  'type' : 'withdrawal'
                                }
                              }
                            }, {
                              success: function() {
                                response.success({
                                  'symbolAmounts' : symbolAmounts,
                                  'totalAmount' : totalAmount,
                                  'toAddress' : toAddress,
                                  // 'userId' : user.id,
                                  'transaction' : transactionId,
                                  'newAssets' : newAssets
                                });
                              },
                              error: function(error) {
                                response.success({
                                  'symbolAmounts' : symbolAmounts,
                                  'totalAmount' : totalAmount,
                                  'toAddress' : toAddress,
                                  // 'userId' : user.id,
                                  'transaction' : transactionId,
                                  'newAssets' : newAssets,
                                  'error' : error
                                });
                              }
                            });

                          }, error: function (setPricesError) {
                            response.error('error setting prices: '+setPricesError.message);
                          }
                        });
                      },
                      error: function (object, error) {
                        response.error(error);
                      }
                    });
                  },
                  error: function (assetSaveError) {
                    response.error('error saving assets: '+assetSaveError.message);
                  }
                });
              }, error: function (error) {
                response.error(error);
              }
            });
          } else {
            response.error({
              'error' : 'exceeds available balance'
            });
          }
        }, error: function(error) {
          response.error(error);
        }
      });
    },
    error: function (fetchUserError) {
      response.error('error fetching user: '+fetchUserError.message);
    }
  });
});

//  Modularized withdrawal from block.io
//  request ex: {"amount":"0.055","toAddress":"A9B4W8RRwSEjhKx7cMhmJR60Rk72sKCOOqrgVVCD"}
Parse.Cloud.define('blockio_withdraw', function(request, response) {
  Parse.Cloud.useMasterKey();
  var amount = parseFloat(request.params['amount'].toFixed(7));
  var toAddress = request.params['toAddress'];
  console.log(amount + ', to: ' + toAddress);
  Parse.Cloud.httpRequest({
    url: 'https://block.io/api/v2/withdraw/?api_key='+blockApiKey+'&amounts='+amount+'&to_addresses='+toAddress+'&pin='+blockApiPin,
    success: function (withdrawResponse) {
      var withdrawData = withdrawResponse.data;
      var status = withdrawData.status;
      var network = withdrawData.data.network;
      var transactionId = withdrawData.data.txid;
      var amountWithdrawn = withdrawData.data.amount_withdrawn;
      var amountSent = withdrawData.data.amount_sent;
      var networkFee = withdrawData.data.network_fee;
      var blockioFee = withdrawData.data.blockio_fee;
      var TransactionClass = Parse.Object.extend('Transaction');
      var transactionQuery = new Parse.Query(TransactionClass);
      transactionQuery.equalTo('transactionId', transactionId);
      transactionQuery.find({
        success: function (transactions) {
          var transaction;
          if(transactions.length === 0) {
            transaction = new TransactionClass();
            transaction.set('transactionId', transactionId);
            transaction.set('network', network);
            transaction.set('amountWithdrawn', parseFloat(amountWithdrawn));
            transaction.set('networkFee', parseFloat(networkFee));
            transaction.set('blockioFee', parseFloat(blockioFee));
          } else {
            transaction = transactions[0];
            transaction.set('network', network);
            transaction.set('amountWithdrawn', parseFloat(amountWithdrawn));
            transaction.set('networkFee', parseFloat(networkFee));
            transaction.set('blockioFee', parseFloat(blockioFee));
          };
          transaction.save(null, {
            success: function (savedTransaction) {
              response.success({
                'withdrawal' : withdrawData,
                'transaction' : transaction,
              });
            }, error: function (error) {
              response.error('error saving transaction: '+error.message);
            }
          });
        }, error: function (error) {
          response.error('error querying transactions: '+error.code+' '+error.message);
        }
      });
    }, error: function (error) {
      console.log(error.data);
      response.error(error);
    }
  });
});

Parse.Cloud.define('btcj_current_value', function(request, response) {
  assets = request.params['assets'];
  endDate = request.params['time'];
  // console.log("user inputs are" + assets + "and" + endDate);
  var assetValue = 0;
  var BTCJamClass = Parse.Object.extend('BTCJam');
  var BTCJamQuery = new Parse.Query(BTCJamClass);
  BTCJamQuery.exists('return');
  BTCJamQuery.find({
    success: function(portfolio) {
      var object = portfolio[0];
      var returnData = object.get('return');
      var margin = 0;
      var value = 0;
      assets.forEach(function(rangeAsset, index) {
        var date = rangeAsset.get('createdAt');
        var amount = rangeAsset.get('amount');
        var utcCreated = parseInt((date.getTime()).toString().slice(0,-3));
        margin = margin + amount;
        var base = (1+(returnData*1000000)/(1*1000000));
        var exponent = ((endDate - utcCreated)/(86400000*365));
        var exponentTop = (endDate - utcCreated);
        var exponentBottom = (86400000*365);
        var pow = Math.pow(base, exponent);
        var powerWithP = amount * pow;
        value = value + powerWithP;
        assetValue = assetValue + value;
      });
      response.success({
        "value" : assetValue,
        "time": endDate
      });
    }, error: function(error) {
      response.error('error: ' + error.message);
    }
  });
});

Parse.Cloud.define('btcj_current_value_me', function(request, response) {
  var assets = request.params['assets'];
  var endTime = request.params['date'];
  var BTCJamClass = Parse.Object.extend('BTCJam');
  var BTCJamQuery = new Parse.Query(BTCJamClass);
  BTCJamQuery.exists('return');
  BTCJamQuery.find({
    success: function(portfolio) {
      var object = portfolio[0];
      var returnData = object.get('return');
      var assetBars = [];
      var start = 0;
      var time = request.params['date'];
      var margin = 0;
      var value = 0;
      var assetBar = {};
      assets.forEach(function(rangeAsset, index) {
        var date = rangeAsset.get('createdAt');
        var utcCreated = parseInt((date.getTime()).toString().slice(0,-3));
        utcTime = parseInt((date.getTime()).toString().slice(0,-3));
        if (utcCreated < time && utcCreated < endTime) {
          var amount = rangeAsset.get('amount');
          // console.log("this is the amount: " + amount);
          margin = margin + amount;
          var base = (1+(returnData*1000000)/(1*1000000));
          // console.log('base: ' + base);
          var exponent = ((time - utcCreated)/(86400000*365));
          var exponentTop = (time - utcCreated);
          var exponentBottom = (86400000*365);
          // console.log("exponent top: " + exponentTop + "exponent bottom: " + exponentBottom);
          // console.log('exponent: ' + exponent);
          // console.log("exponent should be 0.00000130206747844");
          // console.log("utcCreated" + utcCreated);
          // console.log("time" + time);
          var pow = Math.pow(base, exponent);
          // console.log("pow: " + pow);
          var powerWithP = amount * pow;
          // console.log("powWithP: " + powerWithP);
          value = value + powerWithP;
          // console.log('this is the value: ' + value);
        } else {
          // console.log(utcCreated + " is less than both " + end + " and " + time);
        }
      });
      var change = 0;
      if (margin > 0) {
        change = ((value - margin) / margin) * 100;
      }
      assetBars.push({
        'margin': margin,
        'value': value,
        'time': time,
        'change': change
      });
      response.success({
        'utcCreated' : utcTime,
        'assets' : assets.length,
        'assets amount' : assets,
        'barCount' : bars.length,
        'bars': bars,
        'start' : from,
        'end' : to,
        'assetBars' : assetBars,
        'symbol' : 'BTCJ'
      });
    }, error: function(error) {
      response.error('error: ' + error.message);
    }
  });
});

Parse.Cloud.define('btcj_asset_bars', function(request, response) {
  var UserClass = Parse.Object.extend(Parse.User);
  var user = new UserClass();
  user.id = request.params['userId'];
  var from = request.params['from'];
  var to = request.params['to'];
  var resolution = request.params['resolution'];
  var utcTime = 0;
  var getBarsURL = 'https://1broker.com/api/v1/market/get_bars.php?symbol=SP500&from='+from+'&to='+to+'&resolution='+resolution+'&token='+brokerToken+'&pretty=1';
  Parse.Cloud.httpRequest({
    url: getBarsURL,
    success: function(getBarsResponse) {
      var bars = getBarsResponse.data.response;
      var AssetClass = Parse.Object.extend('Asset');
      var AssetQuery = new Parse.Query(AssetClass);
      AssetQuery.equalTo('symbol', 'BTCJ');
      AssetQuery.equalTo('user', user);
      AssetQuery.find({
        success: function (assets) {
          var BTCJamClass = Parse.Object.extend('BTCJam');
          var BTCJamQuery = new Parse.Query(BTCJamClass);
          BTCJamQuery.exists('return');
          BTCJamQuery.find({
            success: function(portfolio) {
              var object = portfolio[0];
              var returnData = object.get('return');
              var assetBars = [];
              if (bars.length > 0) {
                start = bars[0]['time'];
                end = bars[bars.length-1]['time'];
                bars.forEach(function(bar, index) {
                  var time = bar['time'];
                  var close = bar['c'];
                  var margin = 0;
                  var value = 0;
                  var assetBar = {};
                  assets.forEach(function(rangeAsset, index) {
                    var date = rangeAsset.get('createdAt');
                    var utcCreated = parseInt((date.getTime()).toString().slice(0,-3));
                    utcTime = parseInt((date.getTime()).toString().slice(0,-3));
                    var amount = rangeAsset.get('amount');
                    if (utcCreated < time && utcCreated < end) {
                      margin = margin + amount;
                      var base = (1+(returnData*1000000)/(1*1000000));
                      var exponent = ((time - utcCreated)/(86400000*365));
                      var exponentTop = (time - utcCreated);
                      var exponentBottom = (86400000*365);
                      var pow = Math.pow(base, exponent);
                      var powerWithP = amount * pow;
                      value = value + powerWithP;
                    } else {
                      margin += amount;
                      value += amount;
                    };
                  });
                  var change = 0;
                  if (margin > 0) {
                    change = ((value - margin) / margin) * 100;
                  }
                  assetBars.push({
                    'margin': margin,
                    'value': value,
                    'time': time,
                    'change': change
                  });
                });
                response.success({
                  'utcCreated' : utcTime,
                  'assets' : assets.length,
                  'assets amount' : assets,
                  'barCount' : bars.length,
                  'bars': bars,
                  'start' : from,
                  'end' : to,
                  'assetBars' : assetBars,
                  'symbol' : 'BTCJ'
                });
              } else {
                var getQuoteURL = 'https://1broker.com/api/v1/market/quotes.php?symbols=SP500&token='+brokerToken;
                Parse.Cloud.httpRequest({
                  url: getQuoteURL,
                  success: function (getQuoteResponse) {
                    var quotes = getQuoteResponse.data.response;
                    var quote = quotes[0];
                    var quoteSymbol = quote['symbol'];
                    var time = Date.parse(quote['updated']) / 1000;
                    var margin = 0;
                    var value = 0;
                    var assetBar = {};
                    assets.forEach(function(rangeAsset, index) {
                      var date = rangeAsset.get('createdAt');
                      var utcCreated = parseInt((date.getTime()).toString().slice(0,-3));
                      var amount = rangeAsset.get('amount');
                      margin = margin + amount;
                      // if (utcCreated < time) {
                        var base = (1+(returnData*1000000)/(1*1000000));
                        var exponent = ((time - utcCreated)/(86400000*365));
                        var exponentTop = (time - utcCreated);
                        var exponentBottom = (86400000*365);
                        var pow = Math.pow(base, exponent);
                        var powerWithP = amount * pow;
                        value = value + powerWithP;
                      // };
                    });
                    if (value == 0) {
                      value = parseFloat(margin);
                    };
                    var change = 0;
                    if (margin > 0) {
                      change = ((value - margin) / margin) * 100;
                    };
                    assetBars.push({
                      'margin': margin,
                      'value': value,
                      'time': time,
                      'change': change
                    });
                    response.success({
                      'utcCreated' : utcTime,
                      'assets' : assets.length,
                      'assets amount' : assets,
                      'start' : time,
                      'end' : time,
                      'assetBars' : assetBars,
                      'symbol' : 'BTCJ'
                    });
                  }, error: function (error) {
                    response.error('error getting quote: ' + error.message);
                  }
                });
              }
            }, error: function(error) {
              response.error('error: ' + error.message);
            }
          });
        }, error: function(error) {
          response.error('error: ' + error.message);
        }
      });
    }, error: function(error) {
      response.error('error: ' + error.message);
    }
  });
});

Parse.Cloud.job('broker_positions', function(request, response) {
  Parse.Cloud.useMasterKey();
  var AssetClass = Parse.Object.extend('Asset');
  var assetQuery = new Parse.Query(AssetClass);
  assetQuery.doesNotExist('positionId');
  assetQuery.exists('orderId');
  assetQuery.find({
    success: function (assets) {
      Parse.Cloud.httpRequest({
        url: 'https://1broker.com/api/v1/position/list_open.php?token='+brokerToken,
        success: function (positionsResponse) {
          var positions = positionsResponse.data.response;
          positions.forEach(function (position, index) {
            var positionOrderId = position['order_id'].toString();
            var positionId = position['position_id'].toString();
            var entryPrice = parseFloat(position['entry_price']);
            assets.forEach(function (asset, index) {
              var orderId = asset.get('orderId');
              if (orderId == positionOrderId) {
                console.log('reset price:' + asset.get('price') + 'to price: ' + entryPrice);
                asset.set('positionId', positionId);
                asset.set('price', entryPrice);
              };
            });
          });
          Parse.Object.saveAll(assets, {
            success: function (savedAssets) {
              response.success('succesfully matched positionIds');
            },
            error: function (assetSaveError) {
              response.error('error saving assets: '+assetSaveError.message);
            }
          });
        }, error: function(error) {
          response.error('error getting broker positions: ' + error.message);
        }
      });
    }, error: function(error) {
      response.error('error querying assets: ' + error.message);
    }
  });
});

// Parse.Cloud.afterSave('Event', function(request) {
//   // Parse.Cloud.useMasterKey();
//   // var eventObject = request.object;
//   // var user = eventObject.get('user');
//   // var AssetClass = Parse.Object.extend('Asset');
//   // var assetQuery = new Parse.Query(AssetClass);
//   //
//   // var userQuery = [PFUser query];
//   // [userQuery whereKey:@"location" nearGeoPoint:stadiumLocation withinMiles:@1];
//   // var progress = eventObject.get('user');
//   // if (progress == 1) {
//   //
//   // }
//   // console.log('user: '+user.id);
// });

// Not being used atm
//  Sums up all priced assets (needs paging added!)
Parse.Cloud.define('sum_assets', function(request, response) {
  Parse.Cloud.useMasterKey();
  var marginTotals = {};
  var AssetClass = Parse.Object.extend('Asset');
  var assetQuery = new Parse.Query(AssetClass);
  assetQuery.exists('price');
  assetQuery.find({
    success: function (assets) {
      assets.forEach(function(asset, index) {
        var symbol = asset.get('symbol');
        var margin = asset.get('amount');
        if (!(marginTotals.hasOwnProperty(symbol))) {
          marginTotals[symbol] = margin;
        } else {
          marginTotals[symbol] = marginTotals[symbol] + margin;
        };
      });
      response.success(marginTotals);
    }, error: function (error) {
      response.error('error querying assets: '+error.code+' '+error.message);
    }
  });
});

Parse.Cloud.define('blockio_update_transactions', function(request, response) {
  Parse.Cloud.httpRequest({
    url: 'https://block.io/api/v2/get_transactions/?api_key='+blockApiKey+'&type=received',
    success: function (transactionsResponse) {
      var transactionsData = JSON.parse(transactionsResponse.text);
      // response.success(transactionsData.data);
      var transactions = transactionsData.data.txs;
      var senders = [];
      transactions.forEach(function(transaction, index) {
        var sender = transaction.senders[0];
        senders.push(sender);
      });
      // /api/v2/get_transactions/?api_key=API KEY&type=received&before_tx=TXID

      // Parse.Cloud.httpRequest({
      //   url: 'https://block.io/api/v2/get_notifications/?api_key='+blockApiKey,
      //   success: function (notificationsResponse) {
      //     var notificationsData = JSON.parse(notificationsResponse.text);
      //     var notifications = notificationsData.data;
      //     var completedNotifications = 0;
      //     var errors = [];
      //     var deletes = 0;
      //     notifications.forEach(function(notification, index) {
      //


      response.success({
        'senders' : senders,
        'transactions' : transactions.length
      });
    }, error: function (error) {
      response.error('error getting transactions: '+error.code+' '+error.message);
    }
  });
});

Parse.Cloud.define('archive_addresses', function(request, response) {
  Parse.Cloud.useMasterKey();
  var UserClass = Parse.Object.extend(Parse.User);
  var userQuery = new Parse.Query(UserClass);
  userQuery.find({
    success: function (users) {
      var addresses = [];
      users.forEach(function(user, index) {
        var address = user.get('address');
        if (address && address.length > 0) {
          addresses.push(address);
        }
      });
      Parse.Cloud.httpRequest({
        url: 'https://block.io/api/v2/get_my_addresses/?api_key='+blockApiKey,
        success: function (addressesResponse) {
          var addressesData = JSON.parse(addressesResponse.text);
          var allAddresses = addressesData.data.addresses;
          var keepAddresses = [];
          var deleteAddresses = [];
          allAddresses.forEach(function(checkAddress, index) {
            var addressAddress = checkAddress.address;
            var balance = checkAddress.available_balance;
            var addressIndex = addresses.indexOf(addressAddress);
            if (addressIndex !== -1 || balance > 0) {
              keepAddresses.push(addressAddress);
            } else {
              deleteAddresses.push(addressAddress);
            }
          });

          response.success({
            'allAddresses' : allAddresses,
            'userAddresses' : addresses,
            'keepAddresses' : keepAddresses,
            'zdeleteAddresses' : deleteAddresses
          });
        }, error: function (error) {
          response.error(error);
        }
      });
    }, error: function (error) {
      response.error('error getting users: '+error.code+' '+error.message);
    }
  });
});

Parse.Cloud.define('blockio_update_notifications', function(request, response) {
  Parse.Cloud.useMasterKey();
  Parse.Cloud.httpRequest({
    url: 'https://block.io/api/v2/get_notifications/?api_key='+blockApiKey,
    success: function (notificationsResponse) {
      var notificationsData = JSON.parse(notificationsResponse.text);
      var notifications = notificationsData.data;

      var UserClass = Parse.Object.extend(Parse.User);
      var userQuery = new Parse.Query(UserClass);
      userQuery.find({
        success: function (users) {
          var userAddresses = [];
          users.forEach(function(user, index) {
            var address = user.get('address');
            if (address && address.length > 0) {
              userAddresses.push(address);
            }
          });
          var notificationAddresses = [];
          notifications.forEach(function(notification, index) {
            var url = notification.url;
            var notificationId = notification.notification_id;
            var notificationAddress = notification.address;
            notificationAddresses.push(notificationAddress);
          });
          response.success({
            'notificationAddresses' : notificationAddresses,
            'userAddresses' : userAddresses
          });
        }, error: function (error) {
          response.error('error getting users: '+error.code+' '+error.message);
        }
      });
    }, error: function (error) {
      response.error('error getting transactions: '+error.code+' '+error.message);
    }
  });

});

Parse.Cloud.define('bfx_socket', function(request, response) {
  response.success(request);
});

// Retreives Bitfinex deposit address
Parse.Cloud.define('bfx_address', function(request, response) {
  var payload = {
    "request": "/v1/deposit/new",
    "nonce": Date.now().toString(),
    "method": "bitcoin",
    "wallet_name": "deposit",
    "renew": 0
  };
  payload = new Buffer(JSON.stringify(payload)).toString('base64');
  var signature = Crypto.createHmac("sha384", bfxSecret).update(payload).digest('hex'), headers = {
    'X-BFX-APIKEY': bfxKey,
    'X-BFX-PAYLOAD': payload,
    'X-BFX-SIGNATURE': signature
  }
  Parse.Cloud.httpRequest({
    url: bfxURL + '/deposit/new',
    headers: headers,
    body: payload,
    success: function (deposit) {
      response.success(deposit.data);
    }, error: function (error) {
      response.error(error);
    }
  });
});

// Provides current Bitfinex wallet balances
Parse.Cloud.define('bfx_balances', function(request, response) {
  var payload = {
    "request": "/v1/balances",
    "nonce": Date.now().toString(),
  };
  payload = new Buffer(JSON.stringify(payload)).toString('base64');
  var signature = Crypto.createHmac("sha384", bfxSecret).update(payload).digest('hex');
  var headers = {
    'X-BFX-APIKEY': bfxKey,
    'X-BFX-PAYLOAD': payload,
    'X-BFX-SIGNATURE': signature
  }
  Parse.Cloud.httpRequest({
    url: bfxURL + '/balances',
    headers: headers,
    body: payload,
    success: function (offers) {
      response.success(offers.data);
    }, error: function (error) {
      response.error('error: '+error);
    }
  });
});

Parse.Cloud.job('bfx_status', function(request, response) {
  Parse.Cloud.run('bfx_history', {}, {
    success: function(historyData) {
      var totalMargin = 0;
      historyData.forEach(function(transaction, index) {
        var amount = parseFloat(transaction.amount);
        totalMargin += amount;
      });
      Parse.Cloud.run('bfx_balances', {}, {
        success: function(balancesData) {
          var depositAccount;
          balancesData.forEach(function(account, index) {
            if (account.type == 'deposit') {
              depositAccount = account;
            }
          });
          var amount = parseFloat(depositAccount.amount);
          var profit = amount - totalMargin;
          var percentage = ((amount / totalMargin) - 1) * 100;

          var BFXClass = Parse.Object.extend('Bitfinex');
          var bfx = new BFXClass();
          bfx.set('profit', parseFloat(profit));
          bfx.set('margin', parseFloat(totalMargin));
          bfx.set('available', parseFloat(depositAccount.available));
          bfx.set('amount', parseFloat(amount));
          bfx.save(null, {
            success: function(savedBFX) {
              response.success('bfx saved');
            }, error: function(error) {
              response.error('bfx error saving');
            }
          });
          // response.success({
          //   'totalMargin' : totalMargin,
          //   'depositAccount' : depositAccount,
          //   'profit' : profit,
          //   'percentage' : percentage
          // });
        }, error: function(error) {
          response.error(error);
        }
      });
    }, error: function(error) {
      response.error(error);
    }
  });
});

// Provides current Bitfinex wallet balances
Parse.Cloud.define('bfx_history', function(request, response) {
  var payload = {
    "request": "/v1/history/movements",
    "nonce": Date.now().toString(),
    "currency": "BTC",
    "limit": 500
  };
  payload = new Buffer(JSON.stringify(payload)).toString('base64');
  var signature = Crypto.createHmac("sha384", bfxSecret).update(payload).digest('hex');
  var headers = {
    'X-BFX-APIKEY': bfxKey,
    'X-BFX-PAYLOAD': payload,
    'X-BFX-SIGNATURE': signature
  }
  Parse.Cloud.httpRequest({
    url: bfxURL + '/history/movements',
    headers: headers,
    body: payload,
    success: function (offers) {
      response.success(offers.data);
    }, error: function (error) {
      response.error('error: '+error);
    }
  });
});
