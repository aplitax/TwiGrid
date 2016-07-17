/**
 * This file is part of the TwiGrid component
 *
 * Copyright (c) 2013-2015 Petr Kessler (http://kesspess.1991.cz)
 *
 * @license  MIT
 * @link     https://github.com/uestla/twigrid
 */


;(function (window, $, undefined) {


// === jQuery extensions ==========================================

$.fn.extend({

	twgChecked: function (bool) {
		this.each(function () {
			$(this).prop('checked', !!bool)
					.trigger('change');
		});

		return this;
	},

	twgToggleChecked: function () {
		this.each(function () {
			$(this).twgChecked(!$(this).prop('checked'));
		});

		return this;
	},

	twgDisableSelection: function () {
		this.attr('unselectable', 'on')
			.css('user-select', 'none')
			.off('selectstart.twg').on('selectstart.twg', false);

		return this;
	},

	twgClearSelection: function () {
		if (window.getSelection) {
			var selection = window.getSelection();
			if (selection.removeAllRanges) {
				selection.removeAllRanges();
			}

		} else if (window.document.selection) {
			window.document.selection.empty();
		}
	},

	twgEnableSelection: function () {
		this.twgClearSelection();

		this.attr('unselectable', 'off')
			.attr('style', null)
			.off('selectstart.twg');

		return this;
	}

});



// === nette.ajax extension ==========================================

$.nette.ext({

	load: function (handler) {
		var self = this;

		$(self.gridSelector).each(function () {
			// grid parts
			var grid = $(this);
			var form = $(self.formSelector, grid);
			var header = $(self.headerSelector, grid);
			var filterSubmit = $(self.buttonSelector('[name="filters\[buttons\]\[filter\]"]'), header);
			var body = $(self.bodySelector, grid);
			var footer = $(self.footerSelector, grid);

			grid.addClass('js');
			self.focusing($(':input', grid));

			// filtering
			self.filtering(
				$(':input:not(' + self.buttonSelector() + ')', header),
				$('select[name^="filters\[criteria\]\["], :radio[name^="filters\[criteria\]\["], :checkbox[name^="filters\[criteria\]\["]', header),
				filterSubmit
			);

			// inline editing
			self.inlineEditing(
				$(':input[name^="inline\[values\]\["]', body),
				$(self.buttonSelector('[name="inline\[buttons\]\[edit\]"]'), body),
				$(self.buttonSelector('[name="inline\[buttons\]\[cancel\]"]'), body),
				body.children()
			);

			// rows checkboxes
			self.rowsChecking(
				grid,
				self.getGroupActionCheckboxes(grid),
				$(self.buttonSelector('[name^="actions\[buttons\]\["]'), footer),
				header
			);

			// pagination
			self.pagination(
				grid,
				$('select[name^="pagination\[controls\]\["]', footer),
				$(self.buttonSelector('[name="pagination\[buttons\]\[change\]"]'), footer)
			);

			// ajaxification
			self.ajaxify(
				$('a.tw-ajax', grid),
				form,
				$(self.buttonSelector('.tw-ajax'), grid),
				handler
			);
		});
	},

	before: function (xhr, settings) {
		if (!settings.nette) {
			return ;
		}

		// confirmation dialog
		var question = settings.nette.el.attr('data-tw-confirm');

		if (question) {
			return window.confirm(question);
		}
	},

	success: function (payload) {
		// update form action
		if (payload.twiGrid !== undefined && payload.twiGrid.forms !== undefined) {
			$.each(payload.twiGrid.forms, function (form, action) {
				$('#' + form).attr('action', action);
			});
		}

		// scroll to flash message with lowest top offset
		var minFlashTop = null;

		$(this.flashesSelector).each(function () {
			var flashTop = $(this).offset().top + 1;

			if (minFlashTop === null || flashTop < minFlashTop) {
				minFlashTop = flashTop;
			}
		});

		if (minFlashTop !== null) {
			var windowTop = $(window).scrollTop();

			if (windowTop > minFlashTop) {
				$('html, body').animate({
					scrollTop: minFlashTop
				}, this.scrollSpeed);
			}
		}
	}


}, {
	gridSelector: '.twigrid',
	formSelector: '.form:first',
	headerSelector: '.header:first',
	bodySelector: '.body:first',
	footerSelector: '.footer:first',

	flashesSelector: '.alert.tw-flash',
	scrollSpeed: 128,

	buttonSelector: function (selector) {
		var els = ['input[type="submit"]', 'button[type="submit"]', 'input[type="image"]'];
		if (selector) {
			$.each(els, function (i) {
				els[i] = els[i] + selector;
			});
		}

		return els.join(', ');
	},

	getGroupActionCheckboxes: function (grid) {
		return $('input[type="checkbox"][name^="actions\[records\]\["]', grid);
	},

	focusing: function (inputs) {
		var self = this,
			focusedTmp = null;

		if (!self.focusingInitialized) {
			var doc = $(window.document);

			doc.off('click.tw-focus')
				.on('click.tw-focus', function (event) {
					var target = $(event.target);

					if (!target.is(':input')) {
						var grid = target.closest(self.gridSelector);
						self.focusedGrid = grid.length ? grid : null;
					}
				});

			self.focusingInitialized = true;
		}

		inputs.off('focus.tw-focus')
			.on('focus.tw-focus', function (event) {
				focusedTmp = self.focusedGrid;
				self.focusedGrid = null;
			})
			.off('blur.tw-blur')
			.on('blur.tw-blur', function (event) {
				self.focusedGrid = focusedTmp;
				focusedTmp = null;
			});
	},

	filtering: function (inputs, submitters, submit) {
		this.keyboardSubmitting(inputs, submit);

		submitters.off('change.tw-filter')
			.on('change.tw-filter', function (event) {
				submit.trigger('click');
			});
	},

	inlineEditing: function (inputs, submit, cancel, rows) {
		var self = this;
		self.keyboardSubmitting(inputs, submit, cancel);

		if (inputs.length) {
			inputs.first().trigger('focus');
		}

		rows.off('click.tw-inline')
			.on('click.tw-inline', function (event) {
				var row = $(this);
				var edit = $(self.buttonSelector('[name^="inline\[buttons\]\["]:first'), row);

				if (edit.length && !(edit.attr('name') in {'inline[buttons][edit]': 1, 'inline[buttons][cancel]': 1})
						&& !self.isClickable(event.target) && self.onlyCtrlKeyPressed(event)) {
					edit.trigger('click');
				}
			});
	},

	keyboardSubmitting: function (inputs, submit, cancel) {
		var self = this;

		if (inputs.length) {
			inputs.off('focus.tw-keyboard')
				.on('focus.tw-keyboard', function (event) {
					inputs.off('keydown.tw-keyboard')
						.on('keydown.tw-keyboard', function (e) {
							if ((e.keyCode === 13 || e.keyCode === 10) && submit
									&& (self.isInlineSubmitter(e.target) || self.onlyCtrlKeyPressed(e))) { // [enter]

								e.preventDefault();
								submit.trigger('click');

							} else if (e.keyCode === 27 && cancel) {
								e.preventDefault();
								e.stopImmediatePropagation();
								cancel.trigger('click');
							}
						});

				})
				.off('blur.tw-keyboard')
				.on('blur.tw-keyboard', function (event) {
					inputs.off('keypress.tw-keyboard')
						.off('keydown.tw-keyboard');
				});
		}
	},

	rowsChecking: function (grid, checkboxes, buttons, header) {
		if (!checkboxes.length) {
			return ;
		}

		var self = this,
			groupCheckbox = $('<input type="checkbox" />')
				.off('change.tw-rowcheck')
				.on('change.tw-rowcheck', function (event) {
					checkboxes.twgChecked(groupCheckbox.prop('checked'));
				});

		$('.header-cell', header)
			.off('click.tw-allrowcheck')
			.on('click.tw-allrowcheck', function (event) {
				if (!self.isClickable(event.target) && self.noMetaKeysPressed(event)) {
					groupCheckbox.twgToggleChecked();
				}
			})
			.first().html(groupCheckbox);

		checkboxes.each(function (k, val) {
			var checkbox = $(val),
				row = checkbox.parent().parent(),
				handler = function () {
					if (checkbox.prop('checked')) {
						row.addClass('checked');
						buttons.attr('disabled', false);

					} else {
						row.removeClass('checked');
						if (!checkboxes.filter(':checked:first').length) {
							buttons.attr('disabled', true);
						}
					}
				};

			handler();

			checkbox.off('change.tw-rowcheck')
				.on('change.tw-rowcheck', function (event) {
					handler();
				});

			row.off('click.tw-rowcheck')
				.on('click.tw-rowcheck', function (event) {
					if (!self.isClickable(event.target)) {
						if (self.onlyShiftKeyPressed(event)) {
							grid.twgDisableSelection();

							if (self.lastChecked !== null) {
								var checked = checkboxes.eq(self.lastChecked).prop('checked');
								for (var i = 0; i < Math.abs(k - self.lastChecked); i++) {
									checkboxes.eq(Math.abs(k > self.lastChecked ? k - i : k + i))
										.twgChecked(checked);
								}

							} else {
								checkbox.twgToggleChecked();
							}

							grid.twgEnableSelection();

						} else if (self.noMetaKeysPressed(event)) {
							checkbox.twgToggleChecked();
						}

						self.lastChecked = k;
					}
				});
		});
	},

	pagination: function (grid, selects, submit) {
		if (!selects.length) {
			return ;
		}

		var self = this;

		selects.off('change.tw-pagination')
			.on('change.tw-pagination', function (event) {
				self.getGroupActionCheckboxes(grid).prop('checked', false);
				submit.trigger('click');
			});

		$(window.document).off('keydown.tw-pagination')
			.on('keydown.tw-pagination', function (event) {
				if (self.focusedGrid !== null
						&& self.onlyCtrlKeyPressed(event) && (event.keyCode === 37 || event.keyCode === 39)) {
					event.preventDefault();

					selects.each(function () {
						var select = $(this);
						var selected = select.children(':selected');
						var next = event.keyCode === 37 ? selected.prev() : selected.next();

						if (next.length) {
							select.val(next.val());
							select.trigger('change');
						}
					});
				}
			});
	},

	ajaxify: function (links, form, buttons, handler) {
		var self = this;
		links.off('click.tw-ajax')
			.on('click.tw-ajax', handler);

		if (form.hasClass('tw-ajax')) {
			form.off('submit.tw-ajax')
				.on('submit.tw-ajax', handler)
				.off('click.tw-ajax', self.buttonSelector())
				.on('click.tw-ajax', self.buttonSelector(), handler);
		}

		form.off('click.tw-ajax', buttons.selector)
			.on('click.tw-ajax', buttons.selector, handler);
	},


	// helpers

	focusedGrid: null,
	focusingInitialized: false,
	lastChecked: null, // index of last checked row checkbox

	isClickable: function (target) {
		return target.nodeName.toUpperCase() in {'A': 1, 'INPUT': 1, 'TEXTAREA': 1, 'SELECT': 1, 'LABEL': 1};
	},

	isInlineSubmitter: function (target) {
		return !(target.nodeName.toUpperCase() in {'TEXTAREA': 1, 'SELECT': 1});
	},

	noMetaKeysPressed: function (event) {
		return !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
	},

	onlyCtrlKeyPressed: function (event) {
		return (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey;
	},

	onlyShiftKeyPressed: function (event) {
		return event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;
	}

});


})(window, window.jQuery);