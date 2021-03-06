define(['angular/core/services',
        'angular/core/directives',
        'angular/core/controllers',
        'angular/similarity/services/similarity.services',
        'angular/similarity/modules',
        'angular/similarity/controllers/similarity-list.controller',
        'angular/similarity/controllers/create-index.controller'],

	function() {

	    var similarityApp = angular.module('graphdb.framework.similarity').config(config);

	    config.$inject = ['$routeProvider', '$menuItemsProvider'];

	    function config($routeProvider, $menuItemsProvider) {
            $routeProvider.when('/similarity', {
            		  		templateUrl : 'pages/similarity-indexes.html',
            		  		controller : 'SimilarityCtrl',
            				title: 'Similarity indexes',
            				helpInfo: 'Similarity indexes help you look up semantically similar entities and text.'
            		  	}).when('/similarity/index/create', {
           		  	        templateUrl : 'pages/create-index.html',
           		  	        controller : 'CreateSimilarityIdxCtrl',
           		  	        title : 'Create similarity index',
           		  	        helpInfo : 'Index name and select query are required. Add Semantic Vectors parameters if you want.'
            		  	});

            $menuItemsProvider.addItem({label : 'Setup', href : '#', order : 5, role : 'IS_AUTHENTICATED_FULLY', icon: "icon-settings"});
			$menuItemsProvider.addItem({
				label: 'Similarity', href: 'similarity', order: 40, parent: 'Explore', role: "IS_AUTHENTICATED_FULLY",
				children: [{
					href: 'similarity/index/create',
					children: []
				}]
			});
	    }

	    return similarityApp;

	}
);
