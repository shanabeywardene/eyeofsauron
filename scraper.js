// process.env.TZ
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
    authToken:'ZWExOWU3YTM1ZTZmODJkMjQ2OWMyMmZiNjVlNTYx'
});

//-- End of requires

var file = './app.json';
var formerDataFile = './formerData.json';
var formerData = {
    title : null
};

var HOST = 'http://ikman.lk/';
var page =  HOST + 'en/ads/sri-lanka/cars';

//http://ikman.lk/en/ads/sri-lanka/cars

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
            console.log('write file error')
            return res.json({err:err});
        }
        res.send('success');
    });
});

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
                // var topItem = $('li.item.item-regular:not(.item-top)')[0];
                // var basicData = JSON.parse(topItem.attribs['data-item']);
                // var datePosted = parseFloat($($('.item-regular:not(.item-top)>.h-stack>.meta-container>.meta>.information-row>.date')[0]).attr('data-time') * 1000);
                // data.title = basicData.title;
                // data.price = basicData.show_attr ? basicData.show_attr.value : 'n/a';
/** */
                var topItem = $('div.serp-items div.ui-item:not(.is-top)').find('.item-extras:empty')[0].parent;
                var loc = $(topItem).find('.item-content').find('p.item-location span:not(.is-member)');
                data.mileage = $(topItem).find('.item-content').find('p.item-meta').text();
                data.title = $(topItem).find('.item-content').find('a.item-title').text();
                data.price = $(topItem).find('.item-content').find('.item-info>strong').text();
                var datePosted = $(loc[0]).text();
/** */
                if (!withinTheDay(datePosted)) return next();

                if ( data.title === res.formerData.title || data.title === formerData.title ) return next();
                if (!hasKeyword(data.title)) {
                    console.log(data.title + ' has no keywords on it.');
                    return next();
                }

                var url = $(topItem).find('.item-content').find('a.item-title').attr('href');
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
                
                // var attrArr = $('.item-attrs>.attr');
                // for (var i in attrArr) {
                //     var attr = attrArr[i];
                //     if (attr.children) {
                //         if ($(attr.children[0]).text() == 'Location:')  data.location = $(attr.children[1]).text();
                //         if ($(attr.children[0]).text() == 'Brand:')  data.brand = $(attr.children[1]).text();
                //         if ($(attr.children[0]).text() == 'Model:')  data.model = $(attr.children[1]).text();
                //         if ($(attr.children[0]).text() == 'Model year:')  data.modelYear = $(attr.children[1]).text();
                //         if ($(attr.children[0]).text() == 'Engine capacity:')  data.engineCapacity = $(attr.children[1]).text();
                //         if ($(attr.children[0]).text() == 'Mileage:')  data.mileage = $(attr.children[1]).text();
                //     }
                // }
                var attrArr = $('.item-properties dl');
                for (var i=0, $i; i<attrArr.length; i++) {
                    $i = $(attrArr[i]);
                    switch($i.find('dt').text()) {
                        case ('Location:'):  data.location = $i.find('dd').text(); break;
                        case ('Brand:'):  data.brand = $i.find('dd').text(); break;
                        case ('Model:'):  data.model = $i.find('dd').text(); break;
                        case ('Model year:'):  data.modelYear = $i.find('dd').text(); break;
                        case ('Engine capacity:'):  data.engineCapacity = $i.find('dd').text(); break;
                        case ('Mileage:'):  data.mileage = $i.find('dd').text(); break;
                        default: 
                            data[$i.find('dt').text().replace(':', '').toLowerCase()] = $i.find('dd').text();
                            break;
                    }
                    // data[$i.find('dt').text().replace(':', '').toLowerCase()] = $i.find('dd').text();
                }

                var numbers = [];
                // var numDivs = $('.inner-box>.number');
                var numDivs = $('.item-contact-more.is-showable>ul li');
                for (var ir in numDivs) {
                    var num = numDivs[ir];
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
    console.log(isWithinPriceRange(data));
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
                console.log(status, response);
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
        price = price.replace(',', '').replace(',', '').replace(',', '').replace('Rs', '').replace('.').trim();
        price = parseFloat(price);
        price = price / 10000;
    }
    for( var key in priceChart) {
        if( model.indexOf(key) > -1) {
            if ( priceChart[key][modelYear] >= price || priceIsNa ) {
                return true;
            }
        }
    }
    return false;
}

function withinTheDay(date) {
    var now = new Date();
    var n_date, interval;
    if(date.indexOf('ago') > 0) {
        if(date.indexOf('second') > 0) {
            interval = 0;
        }
        if(date.indexOf('minute') > -1) {
            interval = 60;
        }
        if(date.indexOf('minutes') > 0) {
            switch(1) {
                case date.replace(' minutes ago').indexOf('few') > -1 :
                    interval = 5*60;
                    break;
                case date.replace(' minutes ago').indexOf('four') > -1:
                    interval = 4*60;
                    break;
                case date.replace(' minutes ago').indexOf('three') > -1:
                    interval = 3*60;
                    break;
                case date.replace(' minutes ago').indexOf('two') > -1:
                    interval = 2*60;
                    break;
                case date.replace(' minutes ago').indexOf('ten') > -1:
                    interval = 10*60;
                    break;
                default:
                    // console.log(date.replace(' minutes ago', '').replace('a ', ''));
                    interval = date.replace(' minutes ago', '').replace('a ', '')*60;
                    break;
            }
        }
        n_date = new Date(Date.now() - interval*1000);
        console.log(date);
    } else {
        n_date = new Date(date + ' ' + now.getFullYear());
    }
    if ( ((now - n_date)/(1000*60*60*24.0)) < 1 ) return true;
    console.log("invalid post date.");
    return false;
}

function hasKeyword(title) {
    if(!keywords[0]) return true;
    if(title) {
        for (var iq in keywords) {
            var keyword = keywords[iq].toLowerCase();
            var title1 = title.toLowerCase();
            if (title1.indexOf(keyword) != -1){
                console.log(title1);
                return true;
            }
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
