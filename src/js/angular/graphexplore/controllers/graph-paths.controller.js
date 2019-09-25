define([
        'angular/core/services',
        'lib/common/d3-utils'
    ],
    function (require, D3) {

        angular
            .module('graphdb.framework.graphexplore.controllers.graphviz.graphpath', [
                'toastr',
                'ui.bootstrap',
            ])
            .controller('GraphPathVisualizationsCtrl', GraphPathVisualizationsCtrl);

        GraphPathVisualizationsCtrl.$inject = ["$scope", "$rootScope", "$repositories", "toastr", "$timeout", "$http", "ClassInstanceDetailsService", "AutocompleteService", "$q", "$location"];

        function GraphPathVisualizationsCtrl($scope, $rootScope, $repositories, toastr, $timeout, $http, ClassInstanceDetailsService, AutocompleteService, $q, $location) {

            var width = 1000,
                height = 1000;

            var maxPathLength = 3;

            var nodeLabelRectScaleX = 1.75;

            var force = d3.layout.force()
                .gravity(0.07)
                .size([width, height]);

            var svg = d3.select(".main-container .graph-visualization").append("svg")
                .attr("viewBox", "0 0 " + width + " " + height)
                .attr("preserveAspectRatio", "xMidYMid meet");

            $scope.getActiveRepository = function () {
                return $repositories.getActiveRepository();
            };

            $scope.isLoadingLocation = function () {
                return $repositories.isLoadingLocation();
            };

            $scope.hasActiveLocation = function () {
                return $repositories.hasActiveLocation();
            };

            function initForRepository() {
                if (!$repositories.getActiveRepository()) {
                    return;
                }
                $scope.getNamespacesPromise = ClassInstanceDetailsService.getNamespaces($scope.getActiveRepository());
                $scope.getAutocompletePromise = AutocompleteService.checkAutocompleteStatus();
            }

            $scope.$on('repositoryIsSet', function(event, args) {
                initForRepository();
            });
            initForRepository();

            var findPath = function (startNode, endNode, visited, path) {
                if (startNode === endNode) {
                    return $q.when(path)
                }
                // Find only paths with maxLength
                if (path.length === maxPathLength) {
                    return $q.when([])
                }
                return $http({
                    url: 'rest/explore-graph/links',
                    method: 'GET',
                    params: {
                        iri: startNode,
                        config: 'default',
                        linksLimit: 50
                    }
                }).then(function (response) {
                    var flights = _.filter(response.data, function(r) {return r.predicates[0] == "hasFlightTo"});
                    var promises = _.map(flights, function (link) {
                        var o = link.target;
                        if (!visited.includes(o)) {
                            return findPath(o, endNode, visited.concat(o), path.concat(link));
                        }
                        return $q.when([]);
                    });
                    return $q.all(promises);
                }, function (response) {
                    var msg = getError(response.data);
                    toastr.error(msg, 'Error looking for path node');
                });
            }

            $scope.findPath = function (startNode, endNode) {
                findPath(startNode, endNode, [startNode], []).then(function (linksFound) {
                    renderGraph(_.flattenDeep(linksFound));
                });
            }

            function renderGraph(linksFound) {
                var graph = new Graph();

                var nodesFromLinks = _.union(_.flatten(_.map(linksFound, function (d) {
                    return [d.source, d.target];
                })));

                var promises = [];
                var nodesData = [];

                _.forEach(nodesFromLinks, function (newNode, index) {
                    promises.push($http({
                        url: 'rest/explore-graph/node',
                        method: 'GET',
                        params: {
                            iri: newNode,
                            config: 'default',
                            includeInferred: true,
                            sameAsState: true
                        }
                    }).then(function (response) {
                        // Save the data for later
                        nodesData[index] = response.data;
                    }));
                });

                // Waits for all of the collected promises and then:
                // - adds each new node
                // - redraws the graph
                $q.all(promises).then(function () {
                    _.forEach(nodesData, function (nodeData, index) {
                        // Calculate initial positions for the new nodes based on spreading them evenly
                        // on a circle.
                        var theta = 2 * Math.PI * index / nodesData.length;
                        var x = Math.cos(theta) * height / 3;
                        var y = Math.sin(theta) * height / 3;
                        graph.addNode(nodeData, x, y);
                    });

                    graph.addLinks(linksFound);
                    draw(graph);
                });
            }

            function Graph() {
                this.nodes = [];
                this.links = [];

                this.addNode = function (node, x, y) {
                    node.x = x;
                    node.y = y;
                    this.nodes.push(node);
                    return node;
                };

                this.addLinks = function (newLinks) {
                    var nodes = this.nodes;
                    var linksWithNodes = _.map(newLinks, function (link) {
                        return {
                            "source": _.find(nodes, function (o) {
                                return o.iri === link.source;
                            }),
                            "target": _.find(nodes, function (o) {
                                return o.iri === link.target;
                            }),
                            "predicates": link.predicates
                        };
                    });
                    Array.prototype.push.apply(this.links, linksWithNodes);
                };
            }

            function draw(graph) {
                d3.selectAll("svg g").remove();


                var container = svg.append("g").attr("class", "nodes-container");

                var link = svg.selectAll(".link"),
                    node = svg.selectAll(".node");

                force.nodes(graph.nodes).charge(-3000);
                force.links(graph.links).linkDistance(function (link) {
                    // link distance depends on length of text with an added bonus for strongly connected nodes,
                    // i.e. they will be pushed further from each other so that their common nodes can cluster up
                    return getPredicateTextLength(link) + 30;
                });

                function getPredicateTextLength(link) {
                    var textLength = link.source.size * 2 + link.target.size * 2 + 50;
                    return textLength * 0.75;
                }


                // arrow markers
                container.append("defs").selectAll("marker")
                    .data(force.links())
                    .enter().append("marker")
                    .attr("class", "arrow-marker")
                    .attr("id", function (d) {
                        return d.target.size;
                    })
                    .attr("viewBox", "0 -5 10 10")
                    .attr("refX", function (d) {
                        return d.target.size + 11;
                    })
                    .attr("refY", 0)
                    .attr("markerWidth", 10)
                    .attr("markerHeight", 10)
                    .attr("orient", "auto")
                    .append("path")
                    .attr("d", "M0,-5L10,0L0,5 L10,0 L0, -5");

                // add the links, nodes, predicates and node labels
                var link = container.selectAll(".link")
                    .data(graph.links)
                    .enter().append("g")
                    .attr("class", "link-wrapper")
                    .attr("id", function (d) {
                        return d.source.iri + '>' + d.target.iri;
                    })
                    .append("line")
                    .attr("class", "link")
                    .style("stroke-width", 1)
                    .style("fill", "transparent")
                    .style("marker-end", function (d) {
                        return "url(" + $location.absUrl() + "#" + d.target.size + ")";
                    });

                var predicate = container.selectAll(".link-wrapper")
                    .append("text")
                    .text(function (d, index) {
                        return d.predicates[0];
                    })
                    .attr("class", function (d) {
                        if (d.predicates.length > 1) {
                            return "predicates";
                        }
                        return "predicate";
                    })
                    .attr("dy", "-0.5em")
                    .style("text-anchor", "middle")
                    .style("display", "")
                    .on("mouseover", function (d) {
                        d3.event.stopPropagation();
                    });

                var node = container.selectAll(".node")
                    .data(graph.nodes)
                    .enter().append("g")
                    .attr("class", "node-wrapper")
                    .attr("id", function (d) {
                        return d.iri;
                    })
                    .append("circle")
                    .attr("class", "node")
                    .attr("r", function (d) {
                        return d.size;
                    })
                    .style("fill", function (d) {
                        return "rgb(255, 128, 128)";
                    })

                var nodeLabels = container.selectAll(".node-wrapper").append("foreignObject")
                    .style("pointer-events", "none")
                    .attr("width", function (d) {
                        return d.size * 2 * nodeLabelRectScaleX;
                    });
                // height will be computed by updateNodeLabels

                updateNodeLabels(nodeLabels);

                function updateNodeLabels(nodeLabels) {
                    nodeLabels.each(function (d) {
                        d.fontSize = D3.Text.calcFontSizeRaw(d.labels[0].label, d.size, 16, true);
                        // TODO: get language and set it on the label html tag
                    })
                        .attr("height", function (d) {
                            return d.fontSize * 3;
                        })
                        // if this was kosher we would use xhtml:body here but if we do that angular (or the browser)
                        // goes crazy and resizes/messes up other unrelated elements. div seems to work too.
                        .append("xhtml:div")
                        .attr("class", "node-label-body")
                        .style("font-size", function (d) {
                            return d.fontSize + 'px';
                        })
                        .append('xhtml:div')
                        .text(function (d) {
                            return d.labels[0].label;
                        });
                }


                force.on("tick", function () {

                    // recalculate links attributes
                    link.attr("x1", function (d) {
                        return d.source.x;
                    }).attr("y1", function (d) {
                        return d.source.y;
                    }).attr("x2", function (d) {
                        return d.target.x;
                    }).attr("y2", function (d) {
                        return d.target.y;
                    });

                    // recalculate predicates attributes
                    predicate.attr("x", function (d) {
                        return d.x = (d.source.x + d.target.x) * 0.5;
                    }).attr("y", function (d) {
                        return d.y = (d.source.y + d.target.y) * 0.5;
                    });

                    // recalculate nodes attributes
                    node.attr("cx", function (d) {
                        return d.x;
                    }).attr("cy", function (d) {
                        return d.y;
                    });


                    nodeLabels.attr("x", function (d) {
                        return d.x - (d.size * nodeLabelRectScaleX);
                    }).attr("y", function (d) {
                        // the height of the nodeLabel box is 3 times the fontSize computed by updateNodeLabels
                        // and we want to offset it so that its middle matches the centre of the circle, hence divided by 2
                        return d.y - 3 * d.fontSize / 2;
                    });

                });

                force.start();
            }
        }

     }
);
