(function(window) {
	"use strict";

/**
 * Aristchart constructor
 * @param {Object} elem    DOM element
 * @param {Object} options Aristochart options object
 * @param {OBject} theme   Aristochart theme
 *
 * Possible combinations:
 * 	Aristochart(elem, options);
 * 	Aristochart(options, theme);
 * 	Aristochart(options);
 * 	
 */
var Aristochart = function(elem, options, theme) {
	if(!elem) Aristochart.Error("Please a container for the chart.");
	if(!options.data) Aristochart.Error("Please provide some data to plot.");
	if(!options.type) Aristochart.Error("Please specify the type of chart you want rendered.");	
	if(!theme) theme = Aristochart.Themes.default;
	if(Aristochart.supported.indexOf(options.type) == -1) Aristochart.Error("Chart type '" + options.type + "' not supported.");

	//Set the container
	this.container = elem;

	//Append the canvas
	if(this.wrapper) this.wrapper.appendChild(this.canvas);

	//Create it's own registry
	this.registry = new Aristochart.Registry(this);

	//Create Aristochart's render engine
	this.engine = new Aristochart.Engine(this, this.update, this.render);

	//Create the layer store. I don't like the fact that these functions are here
	//TODO: Refactor this area
	this.layers = [];

	var that = this;
	this.layers.width = function(val) {
		that.layers.forEach(function(layer) {
			layer.width(val);
		});
	};

	this.layers.height = function(val) {
		that.layers.forEach(function(layer) {
			layer.height(val);
		})
	};

	//Add a debug border
	if(Aristochart.DEBUG) this.container.style.outline = "3px solid red";

	// Set them to the instance
	this.options = options;
	this.type = options.type;
	this.data = new Aristochart.Data(this.type, options.data);
	this.theme = theme;

	//Initilize some of the data with a "refresh"
	this.refresh();

	//Check to see if the graph is not static, start interactivity
	if(!this.options.static) {
		this.engine.start();

		//Bind the events
		this.container.addEventListener("click", function(event) {
			that.registry.objectsUnder(event.offsetX, event.offsetY).forEach(function(primitive) {
				if(primitive.events.click) primitive.events.click.call(primitive);
			})
		});

		//Add the impossible initial mouse coordinates for update throttling
		that._mouseX = -1;
		that._mouseY = -1;
		that.mouseX = -1;
		that.mouseY = -1;

		//Create the mouse buffer
		this.mouseBuffer = [];

		//Handle mousemove over elements
		this.container.addEventListener("mousemove", function(event) {
			that.mouseX = event.offsetX;
			that.mouseY = event.offsetY;
		});
	}

	//Initilize the chart
	Aristochart.Chart[this.options.type].init.call(this);
};

/**
 * Some enviornment variables
 */
Aristochart.DEBUG = true;
Aristochart.supported = ["pie", "line", "venn"];

/**
 * Creates a new layer and propagates all the primitives related to the chart into a callback instance
 * @param  {Function} callback Callback with any further setup
 * @param {boolean} static Declares whether the layer is static or not.
 * @return {null}            
 */
Aristochart.prototype.layer = function(callback, static) {
	var layer = new Aristochart.Layer(this.container, this.options.width, this.options.height),
		primitives = this.options[this.type];

	//Extend the prototype of the callback
	for(var primitive in primitives) {
		callback.prototype[primitive] = function(data) {
			if(!data) data = {};
			data.ctx = layer.ctx;
			data.canvas = layer.canvas;
			data.static = static;
			return new primitives[primitive](data);
		};

		//The registry
		callback.prototype.registry = this.registry;
	};

	//Create a new callback instance
	new callback;
};

/**
 * Validates specific options such as margin or padding
 * @return {null} 
 */
Aristochart.prototype.validateOptions = function() {
	if(typeof this.options.padding == "number") this.options.padding = expand(this.options.padding)
	if(typeof this.options.margin == "number") this.options.margin = expand(this.options.margin)

	function expand(num) {
		return {
			top: num,
			bottom: num,
			left: num,
			right: num
		}
	}
};

/**
 * Flatten the style object with it's local defaults
 * @param {Object} theme The theme object to parse
 * @return {Object} Parsed theme
 */
Aristochart.prototype.flattenStyle = function(options) {
	return (function recur(style) {
		for(var key in style) {
			if(style.hasOwnProperty(key)) {
				if(key == "default") continue;

				//Recur if necessary
				if(style[key] instanceof Object) style[key] = recur(style[key]);
				
				//Merge with local default
				if(style.default) style[key] = Aristochart._deepMerge(style[key], style.default);
			}
		}

		return style;
	})(options)
};

/**
 * Compiles the theme's render functions into Aristochart primitives
 * @return {null} 
 */
Aristochart.prototype.compilePrimitives = function() {
	var that = this;
	Aristochart.supported.forEach(function(chart) {
		var feature = that.options[chart];
		for(var key in feature) {
			feature[key] = Aristochart.Primitive(that.options.style[chart][key], feature[key]);
		}
	});
};

/**
 * Refresh's the chart's bounds
 * @return {null} 
 */
Aristochart.prototype.refreshBounds = function() {
	var padding = this.options.padding, margin = this.options.margin,
		width = this.options.width, height = this.options.height;

	this.box = {
		x: (padding.left + margin.left),
		x1: width - (padding.right + margin.right),
		y: (padding.top + margin.top),
		y1: height - (padding.bottom + margin.bottom)
	};

	this.box.width = this.box.x1 - this.box.x;
	this.box.height = this.box.y1 - this.box.y;
};

/**
 * Refresh the Aritochart instance. Should be called if any options are changed.
 * @return {null}
 */
Aristochart.prototype.refresh = function() {
	//Collapse the styles to defaults
	Aristochart.log("Merging the theme with the defaults.");
	this.theme = Aristochart._deepMerge(this.theme, Aristochart.Themes.default);
	Aristochart.log("Merging the options with the theme.");
	this.options = Aristochart._deepMerge(this.options, this.theme);
	Aristochart.log("Flattening out style.");
	this.options = this.flattenStyle(this.options);

	//Validate some specific options
	this.validateOptions();

	this.data.refresh();

	//Compile the primitive objects in the theme, render, isInside, etc. in Aristochart.Primitive
	this.compilePrimitives();

	//Refresh the bounding box
	this.refreshBounds();

	this.container.style.height = this.options.height + "px";
	this.container.style.width = this.options.width + "px";

	this.layers.height(this.options.height);
	this.layers.width(this.options.width);
};

/**
 * Aristochart's main update
 * @return {null}
 */
Aristochart.prototype.update = function() {
	//Throttling on the checking. ONly check if the mouse has moved
	if(this.mouseX !== this._mouseX || this.mouseY !== this._mouseY) {

		//Update the mouse
		var current = this.registry.objectsUnder(this.mouseX, this.mouseY);

		//Iterate over the current and call mouseover if not already
		//else call mousemove and put it into a buffer
		for(var i = 0, cache = current.length; i < cache; i++) {
			var primitive = current[i];
			if(!primitive._mouseover) {
				if(primitive.events.mouseover) primitive.events.mouseover.call(primitive);
				primitive._mouseover = true;
				this.mouseBuffer.push(primitive);
			} else {
				if(primitive.events.mousemove) primitive.events.mousemove.call(primitive);
			}
		}

		//Check the buffer to see if the elements are still being hovered
		//if not, remove it from the buffer and call mouseout
		var _buffer = []; //So many buffers
		for(var i = 0, cache = this.mouseBuffer.length; i < cache; i++) {
			var primitive = this.mouseBuffer[i];
			if(current.indexOf(primitive) == -1) {
				if(primitive.events.mouseout) primitive.events.mouseout.call(primitive);
				primitive._mouseover = false;
			} else {
				_buffer.push(primitive);
			}
		}

		this.mouseBuffer = _buffer;

		//And replace the coords
		this._mouseX = this.mouseX;
		this._mouseY = this.mouseY;
	}

	this.registry.update();
};

/**
 * The main render function. Renders the registry
 * @return {bull} 
 */
Aristochart.prototype.render = function() {
	//Render the registry of primitives
	this.registry.render();
};

/**
 * Aristochart Error handling
 * @param {*} error Anything to pass to new Error
 */
Aristochart.Error = function(msg, error) {
	if(Aristochart.DEBUG) throw new Error("Aristochart Error: " + msg, error);
};

/**
 * Error log handling
 * @param {*} data Anything to log
 */
Aristochart.log = function() {
	var args = Array.prototype.filter.call(arguments, function() { return true; });
	args.unshift("Aristochart Debug: ")
	if(Aristochart.DEBUG) console.log.apply(console, args);
};

/**
 * Deep merge two object a and b
 *
 * @private
 * @param  {Object} a The object to merge with
 * @param  {Object} b The recipient of the merge or the object to be merged into
 * @return {object}   The merged objects
 *
 * Still having trouble handling this Adrian?
 * 	_deepMerge(a, b) = I want to merge a into b, overwriting values.
 */
Aristochart._deepMerge = function(options, defaults) {
	if(!options || !defaults) Aristochart.Error("Aristochart._deepMerge: Please provide two object to merge!")
	// Used "defaults" and "options" to help with the concept in my head
	return (function recur(options, defaults) {
		for(var key in options) {
			if(options.hasOwnProperty(key)) {
				if(options[key] instanceof Object && defaults[key] instanceof Object) defaults[key] = recur(options[key], defaults[key]);
				else defaults[key] = options[key];
			}
		}

		return defaults;
	})(options, defaults)
};

/**
 * Aristochart data constructor.
 * @param {string} context The chart type
 * @param {*} data    Data
 */
Aristochart.Data = function(context, data) {
	this.raw = data;
	this.context = context;

	//All data initilzation and sanitization occurs in
	//this.refresh. It's called in the Aristochart.refresh.
};

Aristochart.Data.prototype = {
	/**
	 * Validate inputted data
	 * @return {null}
	 */
	validateData: function() {
		var data = this.raw;
		switch(this.context) {
			case "line":
				if(!data.x || !data.y) Aristochart.Error("Invalid line data. Please specify an X property and y property and optional y1, y2, yn etc. properties.");
			break;

			case "pie":
				if(Object.key(data).length < 1) Aristochart.Error("Invalid pie data. Please provide some data in the form of sliceName : value.");
			break;
		}
	},

	/**
	 * When the data is changed, variables needs to be update. This refresh updates those variables.
	 * @return {null} 
	 */
	refresh: function() {
		//Validate and sanitize the data
		this.validateData();

		//Sanitize the data
		Aristochart.Data.sanitize[this.context].call(this);
	},

	/**
	 * Returns the points in the form of line: [x, y]
	 * @return {object} Array of lines and their points
	 */
	getPoints: function() {
		var output = {};
		for(var y in this.raw) {
			if(y == "x") continue; //Skip x

			output[y] = [];

			var arr = this.raw[y], length = arr.length
			for(var i = 0; i < length; i++) {
				var point = {
					x: (this.x.range/(length-1)) * i,
					y: arr[i]
				};

				output[y].push(point);
			}
		}

		return output;
	},

	/**
	 * Get's the min, max of a set of lines
	 * @param  {Object} lines Object of lines with array for values
	 * @return {Object}       {min, max, range}
	 */
	getBounds: function() {
		if(["line"].indexOf(this.context) == -1) Aristochart.Error("Aristochart.Data#getBounds only works on line charts.");

		var max = -Infinity, min = Infinity,
			lines = this.raw;
		for(var line in lines) {
			if(line == "x") continue;
			var data = lines[line];

			for(var i = 0, cache = data.length; i < cache; i++) {
				var value = data[i];

				if(value > max) max = value;
				if(value < min) min = value;
			}
		}

		return {
			max: max,
			min: min,
			range: max - min
		};
	}
};

/**
 * Sanitization of the data functions.
 * @type {Object}
 */
Aristochart.Data.sanitize = {
	/**
	 * Line santization:
	 *
	 * Possible input:
	 * 	{
	 * 		x: int || [int] || [int, int] || [int, int, ..., int],
	 * 		y: [int, ..., int] || { fn, start: stop },
	 * 		y1: [int, ..., int],
	 * 		y2: [int, ..., int],
	 * 		       ...
	 * 		yn: [int, ..., int]
	 * 	}
	 */
	line: function() {
		var data = this.raw, x;

		if(typeof data.x == "number") x = {min: 0, max: data.x, range: data.x};
		else if(data.x instanceof Array && data.x.length == 1) x = {min: 0, max: data.x[0], range: data.x[0]};
		else if(data.x instanceof Array) x = {min: data.x[0], max: data.x[data.x.length - 1], range: data.x[data.x.length -1] - data.x[0]};
		else Aristochart.Error("Bad data. Bad data supplied to the x property.");

		// Make sure the rest are arrays and greater than 1 in length
		for(var line in data) {
			if(line == "x") continue;

			var y = data[line];
			if(!(y instanceof Array)) Aristochart.Error("Bad Data. Please make sure " + line + " is an array of data points");
			else if(y.length < 2) Aristochart.Error("Bad data. Please make sure line " + line + "'s data has more than one data point.");
		}

		//set the x and y
		this.x = x;
		this.y = this.getBounds();

		this.data = data;
	}
};

/**
 * Aristochart Render engine
 * @param {function} update The update function
 * @param {render} render The render function
 */
Aristochart.Engine = function(context, update, render) {
	this.context = context;
	this.update = update;
	this.render = render;
	this.running = false;
	this.frame = 0;
};

/**
 * Start the render engine
 * @return {null}
 */
Aristochart.Engine.prototype.start = function() {
	this.running = true;

	var that = this;
	(function tick() {
		if(that.running) {
			requestAnimFrame(tick);
			that.update.call(that.context);
			that.render.call(that.context);
		}
	})();
};

/**
 * Stop the render engine
 * @return {null} 
 */
Aristochart.Engine.prototype.stop = function() {
	this.running = false;
};

/**
 * Primitive class creator
 * @param {Object} style  The style related to the primitive
 * @param {Object} obj    Data to be merged with the primitive
 * @param {HTMLElement} canvas A canvas to render on
 * @param {CanvasRenderingContext2D} ctx    The context to render ont
 */
Aristochart.Primitive = function(style, obj, canvas, ctx) {
	if(!obj.render) Aristochart.Error("Aristochart.Primitive: Forgot to supply a render function when creating a primitive.");
	if(obj.events && !obj.isInside) Aristochart.Error("Aristochart.Primitive: Event object supplied but no isInside function supplied.");

	/**
	 * Primitive Constructor.
	 */
	var Primitive = function(data) {
		//Default
		this.index = 0;
		this.visible = true;
		this.static = false;
		this.mouseEnabled = true;

		//Animation variables
		this.alpha = 1;
		this.rotation = 0;
		this.scale = 1;
		this.animationBuffer = [];

		//For extensibility outside of the layer function
		this.ctx = ctx;
		this.canvas = canvas;

		//Add the primitive's events
		this.events = obj.events || {};

		//If there's no events associated with the primitive, there's no point in checking
		//on mouseover etc.
		if(!Object.keys(this.events)[0]) this.mouseEnabled = false;

		//Merge
		if(data) Aristochart._deepMerge(data, this);

		//Custom initilization
		if(obj.init) obj.init.call(this);

		//Merge the styles
		if(style) Aristochart._deepMerge(style, this);
	};

	/**
	 * For debug purposes. Renders a bounding box around an element.
	 * @return {null}
	 */
	Primitive.prototype.drawBoundingBox = function() {
		if(!this.getBoundingBox) Aristochart.Error("Primitive#drawBoundingBox: getBoundingBox not defined. Please define it if you want to draw the bounding box.");

		var box = this.getBoundingBox();
		this.ctx.beginPath();
		this.ctx.strokeStyle = "#f00";
		this.ctx.lineWidth = 3;
		this.ctx.moveTo(box.x, box.y);
		this.ctx.lineTo(box.x1, box.y);
		this.ctx.lineTo(box.x1, box.y1);
		this.ctx.lineTo(box.x, box.y1);
		this.ctx.closePath();
		this.ctx.stroke();
	};

	/**
	 * Animate a properties on a primitive
	 * @param  {object} properties The properties to animate eg. { x: value }
	 * @param  {int} frames   The frames for the animate to span
	 * @param  {string} easing   Easing function
	 * @param  {function} callback   Callback on complete
	 * @return {null}
	 */
	Primitive.prototype.animate = function(properties, frames, callback, easing) {
		if(typeof callback == "string") easing = new String(callback), callback = undefined;
		if(easing && !Aristochart.Easing[easing]) Aristochart.Error("Easing function '" + easing + "' does not exist. See Aristochart.Easing for a list of supported easing functions.");

		for(var prop in properties) {
			if(this[prop] == undefined) { Aristochart.Error("Primitive#Animate: Property '" + prop + "' does not exist."); continue; }
			if(typeof this[prop] !== "number") { Aristochart.Error("Primitive#Animate: Property '" + prop + "' is not a number and is unanimatable"); continue; }
			
			//TODO: Dynamic time calculation based on FPS or per frame calculation
			var frames = frames,
				property = properties[prop],
				range = property - this[prop];

			this.animationBuffer.push({
				update: function(frame, prop, value) {
					this[prop] = value;
				},

				frame: frames,
				length: frames,
				callback: callback,
				property: prop,
				initialValue: this[prop],
				range: range,
				easing: Aristochart.Easing[easing] || Aristochart.Easing.easeInQuad
			});
		}
	};

	Primitive.prototype.transition = function(transition, duration, callback, easing) {
		//Convert the duration to frames
		duration = (duration) ? duration * 60 : 60;

		var animation;

		switch(transition) {
			case "fadeout":
				animation = { alpha: 0 };
			break;

			case "fadein":
				animation = { alpha: 1 };
			break;

			case "fadeinright":
				var cache = this.x;
				this.x = cache - 40;
				animation = { alpha: 1, x: cache };
			break;

			case "fadeinleft":
				var cache = this.x;
				this.x = cache + 40;
				animation = { alpha: 1, x: cache };
			break;
		}

		this.animate(animation, duration, callback, easing);
	};

	Primitive.prototype.update = function() {
		var animationBuffer = this.animationBuffer;

		if(this.animationBuffer[0]) {
			var newBuffer = [];

			//Run any animations in queue
			//Needs to be fast.
			for(var i = 0, length = animationBuffer.length; i < length; i++) {
				var animation = animationBuffer[i];

				if(animation.frame) {
					var value = animation.easing(undefined, (animation.length - animation.frame) + 1, 0, animation.range, animation.length);
					animation.update.call(this, animation.length - animation.frame, animation.property, animation.initialValue + value);
					animation.frame--;
					newBuffer.push(animation);
				} else {
					if(animation.callback && !animation.callback.called) animation.callback.call(this), animation.callback.called = true;
				}
			}

			//Replace the buffer
			this.animationBuffer = newBuffer;
		}
	};

	Primitive.prototype.render = function() {
		this.ctx.save();

		//Render a bounding box if necessary
		// if(Aristochart.DEBUG) this.drawBoundingBox();

		this.ctx.translate(this.x, this.y);
		this.ctx.rotate(this.rotation);
		this.ctx.scale(this.scale, this.scale);
		this.ctx.globalAlpha = this.alpha;
		obj.render.call(this, this.ctx);
		this.ctx.restore();
	};

	Primitive.prototype.isInside = obj.isInside;
	Primitive.prototype.getBoundingBox = obj.getBoundingBox;

	return Primitive;
};

/**
 * The Aristochart registry
 * @type {Object}
 */
Aristochart.Registry = function(context) {
	this.registry = [];
	this.buffer = []; 
	this.context = context;
};

Aristochart.Registry.prototype = {
	/**
	 * objectsUnder -- Test to see if there is a primitive at coord x, y
	 * @param  {int} x The x coordinate (raster)
	 * @param  {int} y The y coordinate (raster)
	 * @return {array}   Array of objects if any
	 */
	objectsUnder: function(x, y) {
		var objectsUnder = [];

		for(var i = 0, cache = this.registry.length; i < cache; i++) {
			var primitive = this.registry[i];
			if(primitive.isInside(x - primitive.x, y - primitive.y)) objectsUnder.push(primitive);
		}

		return objectsUnder;
	},

	/**
	 * add -- Adds an primitive to the registry
	 * @param {Object} primitive The primitive to add
	 * @return {null}     
	 */
	add: function(primitive) {
		if(Array.isArray(primitive)) this.registry = this.registry.concat(primitive);
		else this.registry.push(primitive);
	},

	/**
	 * remove -- Remove an object from the registry
	 * @param  {Object} obj The object/primitive to remove
	 * @return {null}     
	 */
	remove: function(obj) {
		this.registry.splice(this.registry.indexOf(obj), 1);
	},

	/**
	 * Updates the registry
	 * @return {null} 
	 */
	update: function() {
		for (var i = this.registry.length - 1; i >= 0; i--) {
			this.registry[i].update();
		};
	},

	/**
	 * Renders the registry
	 * @return {null} 
	 */
	render: function() {
		for (var i = this.registry.length - 1; i >= 0; i--) {
			this.registry[i].render();
		};
	}
};

/**
 * Aristochart's Layer class. Manages the canvas
 */
Aristochart.Layer = function(container, width, height) {
	//Create the canvas
	this.canvas = document.createElement("canvas");
	this.ctx = this.canvas.getContext("2d");

	//All layers are absolute
	this.canvas.style.position = "absolute";

	//Set the resolution
	this.resolution = window.devicePixelRatio || 1;

	//Set the layer width and height
	this.width(width);
	this.height(height);

	//Set it to active by default
	this.static = false;

	//scale the canvas
	this.ctx.scale(this.resolution, this.resolution);
	
	//Define the getter and setter for the index
	Object.defineProperty(this, "index", {
		get: function() {
			return this._index;
		},

		set: function(value) {
			this._index = value;
			this.canvas.style.zIndex = value;
		}
	});

	//Set the index	
	this.index = container.children.length;

	//Append the canvas
	container.appendChild(this.canvas);

};

Aristochart.Layer.prototype = {
	width: function(val) {
		this.canvas.width = val * this.resolution;
		this.canvas.style.width = val + "px";
	},

	height: function(val) {
		this.canvas.height = val * this.resolution;
		this.canvas.style.height = val + "px";
	},

	clear: function() {
		this.ctx.clearRect(0, 0, this.canvas.height, this.canvas.width);
	},

	background: function(fill) {
		ctx.fillStyle = fill;
		ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
	}
};

/**
 * Awesome Easing functions courtesy of 
 * https://github.com/danro/jquery-easing/blob/master/jquery.easing.js
 *
 * TERMS OF USE - EASING EQUATIONS
 * 
 * Open source under the BSD License. 
 * 
 * Copyright © 2001 Robert Penner
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without modification, 
 * are permitted provided that the following conditions are met:
 * 
 * Redistributions of source code must retain the above copyright notice, this list of 
 * conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright notice, this list 
 * of conditions and the following disclaimer in the documentation and/or other materials 
 * provided with the distribution.
 * 
 * Neither the name of the author nor the names of contributors may be used to endorse 
 * or promote products derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY 
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 *  COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 *  EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
 *  GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED 
 * AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 *  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED 
 * OF THE POSSIBILITY OF SUCH DAMAGE.
 * 
 */
Aristochart.Easing = {
	easeInQuad: function (x, t, b, c, d) {
		return c*(t/=d)*t + b;
	},

	easeOutQuad: function (x, t, b, c, d) {
		return -c *(t/=d)*(t-2) + b;
	},

	easeInOutQuad: function (x, t, b, c, d) {
		if ((t/=d/2) < 1) return c/2*t*t + b;
		return -c/2 * ((--t)*(t-2) - 1) + b;
	},

	easeInCubic: function (x, t, b, c, d) {
		return c*(t/=d)*t*t + b;
	},

	easeOutCubic: function (x, t, b, c, d) {
		return c*((t=t/d-1)*t*t + 1) + b;
	},

	easeInOutCubic: function (x, t, b, c, d) {
		if ((t/=d/2) < 1) return c/2*t*t*t + b;
		return c/2*((t-=2)*t*t + 2) + b;
	},

	easeInQuart: function (x, t, b, c, d) {
		return c*(t/=d)*t*t*t + b;
	},

	easeOutQuart: function (x, t, b, c, d) {
		return -c * ((t=t/d-1)*t*t*t - 1) + b;
	},

	easeInOutQuart: function (x, t, b, c, d) {
		if ((t/=d/2) < 1) return c/2*t*t*t*t + b;
		return -c/2 * ((t-=2)*t*t*t - 2) + b;
	},

	easeInQuint: function (x, t, b, c, d) {
		return c*(t/=d)*t*t*t*t + b;
	},

	easeOutQuint: function (x, t, b, c, d) {
		return c*((t=t/d-1)*t*t*t*t + 1) + b;
	},

	easeInOutQuint: function (x, t, b, c, d) {
		if ((t/=d/2) < 1) return c/2*t*t*t*t*t + b;
		return c/2*((t-=2)*t*t*t*t + 2) + b;
	},

	easeInSine: function (x, t, b, c, d) {
		return -c * Math.cos(t/d * (Math.PI/2)) + c + b;
	},

	easeOutSine: function (x, t, b, c, d) {
		return c * Math.sin(t/d * (Math.PI/2)) + b;
	},

	easeInOutSine: function (x, t, b, c, d) {
		return -c/2 * (Math.cos(Math.PI*t/d) - 1) + b;
	},

	easeInExpo: function (x, t, b, c, d) {
		return (t==0) ? b : c * Math.pow(2, 10 * (t/d - 1)) + b;
	},

	easeOutExpo: function (x, t, b, c, d) {
		return (t==d) ? b+c : c * (-Math.pow(2, -10 * t/d) + 1) + b;
	},

	easeInOutExpo: function (x, t, b, c, d) {
		if (t==0) return b;
		if (t==d) return b+c;
		if ((t/=d/2) < 1) return c/2 * Math.pow(2, 10 * (t - 1)) + b;
		return c/2 * (-Math.pow(2, -10 * --t) + 2) + b;
	},

	easeInCirc: function (x, t, b, c, d) {
		return -c * (Math.sqrt(1 - (t/=d)*t) - 1) + b;
	},

	easeOutCirc: function (x, t, b, c, d) {
		return c * Math.sqrt(1 - (t=t/d-1)*t) + b;
	},

	easeInOutCirc: function (x, t, b, c, d) {
		if ((t/=d/2) < 1) return -c/2 * (Math.sqrt(1 - t*t) - 1) + b;
		return c/2 * (Math.sqrt(1 - (t-=2)*t) + 1) + b;
	},

	easeInElastic: function (x, t, b, c, d) {
		var s=1.70158;var p=0;var a=c;
		if (t==0) return b;  if ((t/=d)==1) return b+c;  if (!p) p=d*.3;
		if (a < Math.abs(c)) { a=c; var s=p/4; }
		else var s = p/(2*Math.PI) * Math.asin (c/a);
		return -(a*Math.pow(2,10*(t-=1)) * Math.sin( (t*d-s)*(2*Math.PI)/p )) + b;
	},

	easeOutElastic: function (x, t, b, c, d) {
		var s=1.70158;var p=0;var a=c;
		if (t==0) return b;  if ((t/=d)==1) return b+c;  if (!p) p=d*.3;
		if (a < Math.abs(c)) { a=c; var s=p/4; }
		else var s = p/(2*Math.PI) * Math.asin (c/a);
		return a*Math.pow(2,-10*t) * Math.sin( (t*d-s)*(2*Math.PI)/p ) + c + b;
	},

	easeInOutElastic: function (x, t, b, c, d) {
		var s=1.70158;var p=0;var a=c;
		if (t==0) return b;  if ((t/=d/2)==2) return b+c;  if (!p) p=d*(.3*1.5);
		if (a < Math.abs(c)) { a=c; var s=p/4; }
		else var s = p/(2*Math.PI) * Math.asin (c/a);
		if (t < 1) return -.5*(a*Math.pow(2,10*(t-=1)) * Math.sin( (t*d-s)*(2*Math.PI)/p )) + b;
		return a*Math.pow(2,-10*(t-=1)) * Math.sin( (t*d-s)*(2*Math.PI)/p )*.5 + c + b;
	},

	easeInBack: function (x, t, b, c, d, s) {
		if (s == undefined) s = 1.70158;
		return c*(t/=d)*t*((s+1)*t - s) + b;
	},

	easeOutBack: function (x, t, b, c, d, s) {
		if (s == undefined) s = 1.70158;
		return c*((t=t/d-1)*t*((s+1)*t + s) + 1) + b;
	},

	easeInOutBack: function (x, t, b, c, d, s) {
		if (s == undefined) s = 1.70158; 
		if ((t/=d/2) < 1) return c/2*(t*t*(((s*=(1.525))+1)*t - s)) + b;
		return c/2*((t-=2)*t*(((s*=(1.525))+1)*t + s) + 2) + b;
	},

	easeInBounce: function (x, t, b, c, d) {
		return c - Aristochart.Easing.easeOutBounce (x, d-t, 0, c, d) + b;
	},

	easeOutBounce: function (x, t, b, c, d) {
		if ((t/=d) < (1/2.75)) {
			return c*(7.5625*t*t) + b;
		} else if (t < (2/2.75)) {
			return c*(7.5625*(t-=(1.5/2.75))*t + .75) + b;
		} else if (t < (2.5/2.75)) {
			return c*(7.5625*(t-=(2.25/2.75))*t + .9375) + b;
		} else {
			return c*(7.5625*(t-=(2.625/2.75))*t + .984375) + b;
		}
	},

	easeInOutBounce: function (x, t, b, c, d) {
		if (t < d/2) return Aristochart.Easing.easeInBounce (x, t*2, 0, c, d) * .5 + b;
		return Aristochart.Easing.easeOutBounce (x, t*2-d, 0, c, d) * .5 + c*.5 + b;
	}
};

/**
 * Chart initilizers
 * @type {Object}
 */
Aristochart.Chart = {
	line: {
		init: function() {
			//Start by populating the registry
			var points = this.data.getPoints();

			var originX = this.box.x,
				originY = this.box.y1;

			//Axis Layer
			this.layer(function() {
				var xAxis = this.axis({
					x: originX,
					y: originY,
					length: 340
				});

				var yAxis = this.axis({
					x: originX,
					y: originY,
					length: 200,
					rotation: -Math.PI/2
				})

				this.registry.add([yAxis, xAxis]);
			});
		}
	},

	//Pluggable primitives
	shapes: {
		/**
		 * Line primitive. Properties required
		 * 	length - Length of the line
		 * @type {[type]}
		 */
		line: function(ctx) {
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(this.length, 0);
			ctx.closePath();
			ctx.strokeStyle = this.stroke;
			ctx.stroke();
		}
	}
};

/**
 * Aristochart's theme store.
 * @type {Object}
 */
Aristochart.Themes = {};

/**
 * The default theme.
 * @type {Object}
 */
Aristochart.Themes.default = {
	static: false,
	background: "#eee",

	width: 400,
	height: 230,

	//Dimensions
	padding: 10,
	margin: 10,

	line: {
		point: {
			init: function() {
			},

			render: function(ctx) {
				var half = this.side/2;
				ctx.beginPath();
				ctx.rect(-half, -half, this.side, this.side);
				ctx.closePath();
				ctx.strokeStyle = this.stroke;
				ctx.lineWidth = this.strokeWidth;
				ctx.stroke();
				ctx.fillStyle = this.fill;
				ctx.fill();
			},

			getBoundingBox: function() {
				var half = this.side/2;
				return {
					x: -half,
					x1: half,
					y: -half,
					y1: half
				}
			},

			isInside: function(x, y) {
				var half = this.side/2;
				if(x > -half && x < half && y > -half && y < half) return true;
				else return false;
			},

			events: {
				click: function() {
					console.log("FART!");
					this.highlighted = true;
				},

				mouseover: function() {
					console.log("MOUSEOVER!");
					this.mouseover = true;
					this.animate({x: this.x + 30, y: this.y + 30 }, 40);
				},

				mousemove: function() {
					console.log("MOUSEMOVE!");
				},

				mouseout: function() {
					console.log("mouseout");
					this.mouseover = false;
				}
			}
		},

		/**
		 * Data sent to primitive
		 * 	length - length of axis
		 * @type {Object}
		 */
		axis: {
			//The axis line does not need to be interactive
			render: Aristochart.Chart.shapes.line
		}
	},

	pie: {
		slice: {
			render: function() {
				//this.ctx blah
			},

			getBoundingBox: function() {

			},

			isInside: function(x, y) {

			},

			events: {
				click: function() {
					this.highlighted = true;
				},

				mouseover: function() {
					this.mouseover = true;
				},

				mouseout: function() {
					this.mouseover = false;
				}
			}
		}
	},

	style: {
		line: {
			tick: {},
			axis: {},

			point: {
				side: 10,
				stroke: "#ff0",
				strokeWidth: 4,
				fill: "#000"
			},

			line: {
				//per line styling
				default: {
					visible: true,
					stroke: "#f00"
				}
			}
		},

		pie: {
			visible: true,

			slice: {
				1: {
					color: "#f00"
				},

				"sliceName": {
					color: "#000"
				},

				default: {
					visible: true,
				}
			}
		}
	}
};

Aristochart.Primitives = {
	rect: {}
};

/**
 * Paul Irish's getAnimFrame polyfill
 */
window.requestAnimFrame = (function(){
  return  window.requestAnimationFrame       ||
          window.webkitRequestAnimationFrame ||
          window.mozRequestAnimationFrame    ||
          function( callback ){
            window.setTimeout(callback, 1000 / 60);
          };
})();

//Expose the Aristochart variable
window.Aristochart = Aristochart;

})(window);