var _ = require('lodash');
var $ = require('jquery');
var numeral = require('numeral');

var d3 = require('plugins/mapster/lib/d3.min.js');
var topojson = require('plugins/mapster/lib/topojson.min.js');

var module = require('ui/modules').get('mapster');

module.directive('vectormap', function (es) {

  function link (scope, element) {

    function onSizeChange() {
      return {
        width: element.parent().width(),
        height: element.parent().height()
      };
    }

    //TODO This event is called twice, I don't know why
    scope.$watch(onSizeChange, _.debounce(function () {
      console.log(".map size changed !");
      console.log(element.parent().width());
      console.log(element.parent().height());
      render();
    }, 250), true);

    function transition(object, route) {
      var l = route.node().getTotalLength();
      var duration = l*20; //TODO Maybe it's not fitting well on small screens
      object.transition()
        .duration(duration)
        .attrTween("transform", delta(route.node())); //TODO Tween sucks
    }

    function delta(path) {
      var l = path.getTotalLength();
      return function(i) {
        return function(t) {
          if (t == 1) {
            console.log("DONE");
            return "scale(0)"; //TODO Yes you hide it but it's still there
          }
          var p = path.getPointAtLength(t * l);
          var t2 = Math.min(t + 0.05, 1);
          var p2 = path.getPointAtLength(t2 * l);

          var x = p2.x - p.x;
          var y = p2.y - p.y;
          var r = 90 - Math.atan2(-y, x) * 180 / Math.PI;
          //var s = Math.min(Math.sin(Math.PI * t) * 0.7, 0.5);
          //return "translate(" + p.x + "," + p.y + ") scale(" + s + ") rotate(" + r + ")";
          var posX = p.x - 5;
          var posY = p.y - 5;
          return "translate(" + posX + "," + posY + ") scale(0.5) rotate(" + r + ")";
        }
      }
    }

    function render() {
      console.log("You called render !");

      // Remove previously drawn map
      $('svg').remove();

      element.css({
        height: element.parent().height(),
        width: '100%'
      });

      var height = element.height();
      var width = element.width();

      //TODO Compute scale automatically depending on window size
      var scale = (height/330)*100;
      console.log("scale", scale);

      var projection = d3.geo.equirectangular()
        .scale(scale)
        .translate([width/2, height/2]);

      var path = d3.geo.path()
        .projection(projection);

      var svg = d3.select("vectormap").append("svg")
        .attr("width", element.parent().width())
        .attr("height", element.parent().height());

      // Declare svg elem to make objects appear above the map
      var map = svg.append("svg")
        .attr("width", element.parent().width())
        .attr("height", element.parent().height());

      // Draw d3 map
      // The first '/' in the url below is required to really access http://url/plugins/... and not app/plugins
      d3.json('/plugins/mapster/lib/map.topo.json', function(error, world) {
        var countries = topojson.feature(world, world.objects.collection).features;
        map.selectAll(".country")
          .data(countries)
          .enter()
          .append("path")
          .attr("class", "country")
          .attr("d", path);
      });

      //THIS FUNCTION IS NEEDED BECAUSE WORLD COORDS != MAP COORDS
      function getCoords(coords) {
        return [coords[1], coords[0]];
      }

      var target_coords = getCoords([48.85, 2.34]);

      // Generate index and retrieve data from es
      //TODO generate index from current date
      var r = es.search({
        index: 'events_storage_2016-05-17',
        body: {
          query: {
            range: {
              // We filter timestamp_insert instead of timestamp_syslog because this last one is often doing shit
              timestamp_insert: {
                gt: 'now-10s'
              }
                                // TODO Percentage aggregation
                                // TODO Filter by IP?
            },
          }
        },
        sort: 'timestamp_insert'
      });

      // Compute promise
      r.then(function(result) {
        var list = result["hits"]["hits"];
        console.log("Computing", list.length, "events.");

        /* Tmp */
        var f = list[0]["_source"]["timestamp_insert"];
        var l = list[list.length-1]["_source"]["timestamp_insert"];
        var wsize = f - l;
        console.log("Window size", f, l, wsize);
        /* Tmp */

        for (var i = 0; i < list.length; i++) {
          if (list[i] == undefined) {
            console.log("Err", i);
            console.log("List", list);
            break;
          }

          var coords = getCoords(list[i]["_source"]["src_coords"].split(','));
          var radius = 5;

          var circle;
          var route;
          var object;

          /* Check if origin already exists */
          if (!$("#c"+i).length) {
            circle = svg.append("circle")
              .attr("r", radius)
              .attr("cx", projection(coords)[0])
              .attr("cy", projection(coords)[1])
              .attr("id", "c"+i)
              .attr("class", "origin");
          }

          /* Check if path already exists */
          if (!$("#p"+i).length) {
            //TODO Cf datum arcs for smoother
            route = svg.append("path")
              .datum({type: "LineString", coordinates:[coords, target_coords]})
              .attr("class", "route")
              .attr("d", path);
          }

          /* Check if object already exists */
          if (!$("#o"+i).length) {
            object = svg.append("path")
              .attr("class", "object")
              .attr("d", "M7.411 21.39l-4.054 2.61-.266-1.053c-.187-.744-.086-1.534.282-2.199l2.617-4.729c.387 1.6.848 3.272 1.421 5.371zm13.215-.642l-2.646-4.784c-.391 1.656-.803 3.22-1.369 5.441l4.032 2.595.266-1.053c.186-.743.085-1.533-.283-2.199zm-10.073 3.252h2.895l.552-2h-4l.553 2zm1.447-24c-3.489 2.503-5 5.488-5 9.191 0 3.34 1.146 7.275 2.38 11.809h5.273c1.181-4.668 2.312-8.577 2.347-11.844.04-3.731-1.441-6.639-5-9.156zm.012 2.543c1.379 1.201 2.236 2.491 2.662 3.996-.558.304-1.607.461-2.674.461-1.039 0-2.072-.145-2.641-.433.442-1.512 1.304-2.824 2.653-4.024z");
          }

          transition(object, route);
        }

      }, function(error) {
        console.log("Error", error);
      });

    }

  }

  return {
    restrict: 'E',
    scope: {
      data: '=',
      options: '='
    },
    link: link
  };
});

