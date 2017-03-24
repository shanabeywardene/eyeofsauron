var cheerio = require('cheerio');
var request = require('request');
var async = require('async');
var jf = require('jsonfile');
var express = require('express');
var bodyParser = require('body-parser');
var app = express();
app.engine('.ejs', require('ejs').__express);
app.use(bodyParser.json());

var plivo = require('plivo');
var api = plivo.RestAPI({
    authId:'MAODGWMDUXYWM4MWZIZJ',
    authToken:'Yjc0NGI3MWQxMDMxYmIyMDgwYjc2ODY2YTJlOWVi'
});

//-- End of requires

var file = './app.json';
var formerDataFile = './formerData.json';
var formerData = {
    title : null
};

var HOST = 'http://ikman.lk/';
var page =  HOST + 'en/ads/sri-lanka/cars';

//var keywords = ['keyword','toyota','waho'];
var keywords = [];
var numbers;
var priceChart;

app.get('/', function(req, res) {
    jf.readFile(file, function(err, data) {
        res.render('app.ejs', {
            data : data,
            title: "Scraper Parameters"
        });
    });
});

app.post('/', function(req, res) {
    var keywords = req.body.keywords;
    var numbers = req.body.numbers;
    var pricechart = req.body.pricechart;
    var data;

    //TODO validations
    try{
        data = {
            keywords : JSON.parse(keywords),
            numbers : JSON.parse(numbers),
            pricechart : JSON.parse(pricechart)
        }
    } catch(e) { return res.json({err: 'Invalid format of data.'}); }

    jf.writeFile(file, data, function(err) {
        if(err) {
            return res.json({err:err});
        }
        res.send('success');
    });
})

app.listen(8080);
console.log('Express app started on port %d', 8080);

function getData(callback) {
    async.auto({
        formerData : function(next) {
            var fd;
            jf.readFile(formerDataFile, function(err, json) {
                fd = json;
                jf.readFile(file, function(err, json1) {
                    keywords = json1.keywords;
                    numbers = json1.numbers;
                    priceChart = json1.pricechart;
                    next(err, fd);
                })
            });
        },
        urlOfFirstCar : ['formerData', function(next, res) {
            request(page, function (err, response, body) {
                if (err || response.statusCode != 200) {
                    console.log(err);
                    next();
                }

                var data = {};

                var $ = cheerio.load(body);
                var topItem = $('li.item.item-regular:not(.item-top)')[0];
                var basicData = JSON.parse(topItem.attribs['data-item']);

                var datePosted = parseFloat($($('.item-regular:not(.item-top)>.h-stack>.meta-container>.meta>.information-row>.date')[0]).attr('data-time') * 1000);
                data.title = basicData.title;
                data.price = basicData.show_attr ? basicData.show_attr.value : 'n/a';

                if (!withinTheDay(datePosted)) return next();

                if ( data.title === res.formerData.title || data.title === formerData.title ) return next();
                if (!hasKeyword(data.title)) {
                    console.log(data.title + ' has no keywords on it.');
                    return next();
                }

                var url = topItem.attribs['data-id'];
                next(null, { url: url, data: data });
            });
        }],
        carData : ['formerData', 'urlOfFirstCar', function(next, res) {
            var url = res.urlOfFirstCar ? res.urlOfFirstCar.url : null;
            var data = res.urlOfFirstCar ? res.urlOfFirstCar.data : null;

            if(!url) return next();
            request(HOST + url, function (err, response, body) {
                if (err || response.statusCode != 200) {
                    console.log(err);
                    return next();
                }
                var $ = cheerio.load(body);

                var attrArr = $('.item-attrs>.attr')
                for (var i in attrArr) {
                    var attr = attrArr[i];
                    if (attr.children) {
                        if ($(attr.children[0]).text() == 'Location:')  data.location = $(attr.children[1]).text();
                        if ($(attr.children[0]).text() == 'Brand:')  data.brand = $(attr.children[1]).text();
                        if ($(attr.children[0]).text() == 'Model:')  data.model = $(attr.children[1]).text();
                        if ($(attr.children[0]).text() == 'Model year:')  data.modelYear = $(attr.children[1]).text();
                        if ($(attr.children[0]).text() == 'Engine capacity:')  data.engineCapacity = $(attr.children[1]).text();
                        if ($(attr.children[0]).text() == 'Mileage:')  data.mileage = $(attr.children[1]).text();
                    }
                }

                var numbers = [];
                var numDivs = $('.inner-box>.number');
                for (var i in numDivs) {
                    var num = numDivs[i];
                    if (num.type == 'tag') {
                        numbers.push($(numDivs[i]).text());
                    }
                }
                data.numbers = numbers;
                data.url = HOST + url;
                next(null, data);
            });
        }],
        sendText: [ 'formerData', 'urlOfFirstCar', 'carData', function(next, res) {
            if(res.carData) {
                textHim(res.carData, next);
            } else {
                next();
            }
        }],
        saveToFile : ['formerData', 'urlOfFirstCar', 'carData', 'sendText', function(next, res) {
            if(res.sendText) {
                jf.writeFile(formerDataFile, res.carData, function(err) {
                    if(err) {
                        console.error('Saving to json the data: ', err);
                        return next();
                    }
                    formerData = res.sendText;
                });
            }
            next();
        }]
    }, callback);
}

function textHim(data, next) {
    if(isWithinPriceRange(data)) {
        var textStr = '';

        delete data.brand;
        delete data.model;

        for(key in data) {
            textStr += data[key] + '\r\n';
        }

        async.eachSeries(numbers, function(number, cb) {
            var params = {
                'src': 'EyeOfSauron',
                'dst' : number,
                'text' : textStr,
                'type' : "sms",
            };

            api.send_message(params, function (status, response) {
                console.log(textStr);
                console.log("Texted " + number);
                console.log(status, response)
                console.log("-------------------------");
                cb();
            });
        }, function(err){
            next(null, data);
        });
    } else {
        next();
    }
}

function isWithinPriceRange(data) {
    var price = data.price;
    var model = data.model.toLowerCase();
    var modelYear = data.modelYear;
    var priceIsNa = false;

    if(price == 'n/a' || price == 'Negotiable price' || price == 'Negotiable') {
        priceIsNa = true;
    } else {
        price = price.replace(',', '').replace(',', '').replace(',', '').replace('Rs. ', '');
        price = parseFloat(price);
        price = price / 100000;
    }

    for(var key in priceChart) {
        if( model.indexOf(key) != -1 && ( priceChart[key][modelYear] >= price || priceIsNa ) ) {
            return true;
        }
    }
    return false;
}

function withinTheDay(date) {
    var now = new Date();
    var date = new Date(date);
    if ( (now - date)/(1000*60*60*24.0) < 0.5 ) return true;
    console.log("invalid post date.")
    return false;
}

function hasKeyword(title) {
    if(!keywords[0]) return true;
    if(title) {
        for (var i in keywords) {
            var keyword = keywords[i].toLowerCase();
            var title1 = title.toLowerCase();
            if (title1.indexOf(keyword) != -1)  return true;
        }
        return false;
    }
    return false;
}

function start() {
    console.log('Starting script...');
    console.log('Script started.');
    setInterval(function() {
        getData( function() {
            return;
        });
    }, 15000);
}

start();

process.on('uncaughtException', function (err) {
    console.error(err.message);
    console.log("Exception caught. Not exiting process..");
});

//please make sure the brand is always smallcase
