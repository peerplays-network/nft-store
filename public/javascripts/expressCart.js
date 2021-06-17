/* eslint-disable prefer-arrow-callback, no-var, no-tabs, prefer-template */
/* globals showNotification, numeral, feather */
$(document).ready(function (){
    if($(window).width() < 768){
        $('.menu-side').on('click', function(e){
            e.preventDefault();
            $('.menu-side li:not(".active")').slideToggle();
        });

        $('.menu-side li:not(".active")').hide();
        $('.menu-side>.active').html('<i class="feather" data-feather="menu"></i>');
        $('.menu-side>.active').addClass('menu-side-mobile');

        // hide menu if there are no items in it
        if($('#navbar ul li').length === 0){
            $('#navbar').hide();
        }

        $('#offcanvasClose').hide();
    }

    $('#userSetupForm').validator().on('submit', function(e){
        if(!e.isDefaultPrevented()){
            e.preventDefault();
            $.ajax({
                method: 'POST',
                url: '/admin/setup_action',
                data: {
                    usersName: $('#usersName').val(),
                    userEmail: $('#userEmail').val(),
                    userPassword: $('#userPassword').val()
                }
            })
            .done(function(msg){
                showNotification(msg.message, 'success', false, '/admin/login');
            })
            .fail(function(msg){
                showNotification(msg.responseJSON.message, 'danger');
            });
        }
    });

    $('#createCustomer').validator().on('click', function(e){
        e.preventDefault();
        if($('#password').val() != $('#frm_userPassword_confirm').val()) {
            $('#customer-form').validator('validate')
             showNotification('Password and Confirm Password should be same.', 'danger');
            return;
        }
        if($('#customer-form').validator('validate').has('.has-error').length === 0){
             $.ajax({
                method: 'POST',
                url: '/customer/create',
                data: {
                    email: $('#email').val(),
                    firstName: $('#firstName').val(),
                    lastName: $('#lastName').val(),
                    address1: $('#address1').val(),
                    address2: $('#address2').val(),
                    country: $('#country').val(),
                    state: $('#state').val(),
                    postcode: $('#postcode').val(),
                    phone: $('#phone').val(),
                    password: $('#password').val(),
                    confirmpassword:$('#frm_userPassword_confirm').val()
                }
            })
            .done(function(msg){
                showNotification(msg.message, 'success', false, '/');
            })
            .fail(function(msg){
                showNotification(msg.responseJSON[0]?.message || msg.responseJSON?.message, 'danger');
            });
        }
    });

    $('#validatePermalink').on('click',function(){
        if($('#productPermalink').val() !== ''){
            $.ajax({
                method: 'POST',
                url: '/admin/validatePermalink',
                data: { permalink: $('#productPermalink').val(), docId: $('#productId').val() }
            })
            .done(function(msg){
                showNotification(msg.message, 'success');
            })
            .fail(function(msg){
                showNotification(msg.responseJSON.message, 'danger');
            });
        }else{
            showNotification('Please enter a permalink to validate', 'danger');
        }
    })

    $('#productNewForm').validator().on('submit', function(e){
        e.preventDefault();
        if($('#productPermalink').val() === '' && $('#productTitle').val() !== ''){
            $('#productPermalink').val(slugify($('#productTitle').val()));
        }

        var file = document.getElementById("productImage").files[0];
        var formData = new FormData();
        formData.append("title", $('#productTitle').val());
        formData.append("productDescription", $('#productDescription').val());
        formData.append("productCategory", $('#category').val() || '');
        formData.append("productPublished", $('#productPublished').val());
        formData.append("productPermalink", $('#productPermalink').val());
        formData.append("productImage",file);
        
        $.ajax({
            method: 'POST',
            url: '/customer/product/insert',
            data: formData,
            contentType: false,
            processData: false
        })
        .done(function(msg){
            showNotification(msg.message, 'success', false, '/customer/products/1');
        })
        .fail(function(msg){
            if(msg.responseJSON && msg.responseJSON.length > 0){
                var errorMessages = validationErrors(msg.responseJSON);
                $('#validationModalBody').html(errorMessages);
                $('#validationModal').modal('show');
                return;
            }
            showNotification(msg.responseJSON.message, 'danger');
        });
    });

    $('#productEditForm').validator().on('submit', function(e){
        e.preventDefault();
        if($('#productPermalink').val() === '' && $('#productTitle').val() !== ''){
            $('#productPermalink').val(slugify($('#productTitle').val()));
        }

        let file;
        if(document.getElementById("productImage").files) {
            file = document.getElementById("productImage").files[0];
        }

        var formData = new FormData();
        formData.append("title", $('#productTitle').val());
        formData.append("productID", $('#productID').val());
        formData.append("nftMetadataID", $('#nftMetadataID').val());
        formData.append("productDescription", $('#productDescription').val());
        formData.append("productCategory", $('#category').val());
        formData.append("productPublished", $('#productPublished').val());
        formData.append("productPermalink", $('#productPermalink').val());

        if(file) {
            formData.append("productImage",file);
        }

        $.ajax({
            method: 'POST',
            url: '/customer/product/update',
            data: formData,
            contentType: false,
            processData: false
        })
        .done(function(msg){
            showNotification(msg.message, 'success', true);
        })
        .fail(function(msg){
            if(msg.responseJSON && msg.responseJSON.length > 0){
                var errorMessages = validationErrors(msg.responseJSON);
                $('#validationModalBody').html(errorMessages);
                $('#validationModal').modal('show');
                return;
            }
            showNotification(msg.responseJSON.message, 'danger');
        });
    });

    $('.btn-delete-offer').on('click', function(){
      if(confirm('Are you sure you want to delete this sell offer?')){
          $.ajax({
              method: 'POST',
              url: '/customer/product/delete',
              data: { offerId: $(this).attr('data-id') }
          })
          .done(function(msg){
              showNotification(msg.message, 'success', true);
          })
          .fail(function(msg){
              showNotification(msg.responseJSON.message, 'danger');
          });
      }
  });

    $(document).on('click', '.menu-btn', function(e){
        e.preventDefault();
        $('body').addClass('pushy-open-right');
    });

	// add the table class to all tables
    $('table').each(function(){
        $(this).addClass('table table-hover');
    });

    if($('#productTags').length){
        $('#productTags').tokenfield();
    }

    $(document).on('click', '.dashboard_list', function(e){
        window.document.location = $(this).attr('href');
    }).hover(function(){
        $(this).toggleClass('hover');
    });

    $(document).on('click', '.btn-qty-minus', function(e){
        e.preventDefault();
        var qtyElement = $(e.target).parent().parent().find('.cart-product-quantity');
        $(qtyElement).val(parseInt(qtyElement.val()) - 1);
        cartUpdate(qtyElement);
    });

    $(document).on('click', '.btn-qty-add', function(e){
        e.preventDefault();
        var qtyElement = $(e.target).parent().parent().find('.cart-product-quantity');
        $(qtyElement).val(parseInt(qtyElement.val()) + 1);
        cartUpdate(qtyElement);
    });

    $(document).on('click', '.btn-delete-from-cart', function(e){
        deleteFromCart($(e.target));
    });

    if($('#pager').length){
        var pageNum = $('#pageNum').val();
        var pageLen = $('#itemsPerPage').val();
        var itemCount = $('#totalItemCount').val();
        var paginateUrl = $('#paginateUrl').val();
        var searchTerm = $('#searchTerm').val();

        if(searchTerm !== ''){
            searchTerm = searchTerm + '/';
        }

        var pagerHref = '/' + paginateUrl + '/' + searchTerm + '{{number}}';
        var totalItems = Math.ceil(itemCount / pageLen);

        if(parseInt(itemCount) > parseInt(pageLen)){
            $('#pager').bootpag({
                total: totalItems,
                page: pageNum,
                maxVisible: 5,
                href: pagerHref,
                wrapClass: 'pagination',
                prevClass: 'page-item previous',
                nextClass: 'page-item next',
                activeClass: 'page-item active'
            });

            // Fix for Bootstrap 4
            $('#pager a').each(function(){
                $(this).addClass('page-link');
            });
        }
    }

    $('#customerLogout').on('click', function(e){
        $.ajax({
            method: 'POST',
            url: '/customer/logout',
            data: {}
        })
        .done(function(msg){
            location.reload();
        });
    });

    $('#customerForgotten').validator().on('submit', function(e){
        if(!e.isDefaultPrevented()){
            e.preventDefault();
            $.ajax({
                method: 'POST',
                url: '/customer/forgotten_action',
                data: {
                    email: $('#email').val()
                }
            })
            .done(function(msg){
                showNotification(msg.message, 'success');
            })
            .fail(function(msg){
                if(msg.message){
                    showNotification(msg.responseJSON.message, 'danger');
                    return;
                }
                showNotification(msg.responseText, 'danger');
            });
        }
    });

    $(document).on('click', '#createAccountCheckbox', function(e){
        $('#newCustomerPassword').prop('required', $('#createAccountCheckbox').prop('checked'));
    });

    $('#checkoutInformation').validator().on('click', function(e){
        e.preventDefault();
        if($('#shipping-form').validator('validate').has('.has-error').length === 0){
            // Change route if customer to be saved for later
            var route = '/customer/save';
            if($('#createAccountCheckbox').prop('checked')){
                route = '/customer/create';
            }
            $.ajax({
                method: 'POST',
                url: route,
                data: {
                    email: $('#shipEmail').val(),
                    company: $('#shipCompany').val(),
                    firstName: $('#shipFirstname').val(),
                    lastName: $('#shipLastname').val(),
                    address1: $('#shipAddr1').val(),
                    address2: $('#shipAddr2').val(),
                    country: $('#shipCountry').val(),
                    state: $('#shipState').val(),
                    postcode: $('#shipPostcode').val(),
                    phone: $('#shipPhoneNumber').val(),
                    password: $('#newCustomerPassword').val(),
                    orderComment: $('#orderComment').val()
                }
            })
            .done(function(){
                window.location = '/checkout/shipping';
            })
            .fail(function(msg){
                showNotification(msg.responseJSON.message, 'danger');
            });
        }
    });

    $('#addDiscountCode').on('click', function(e){
        e.preventDefault();
        $.ajax({
            method: 'POST',
            url: '/checkout/adddiscountcode',
            data: {
                discountCode: $('#discountCode').val()
            }
        })
        .done(function(msg){
            showNotification(msg.message, 'success', true);
        })
        .fail(function(msg){
            showNotification(msg.responseJSON.message, 'danger');
        });
    });

    $('#removeDiscountCode').on('click', function(e){
        e.preventDefault();
        $.ajax({
            method: 'POST',
            url: '/checkout/removediscountcode',
            data: {}
        })
        .done(function(msg){
            showNotification(msg.message, 'success', true);
        })
        .fail(function(msg){
            showNotification(msg.responseJSON.message, 'danger');
        });
    });

    $('#loginForm').on('click', function(e){
        if(!e.isDefaultPrevented()){
            e.preventDefault();
            $.ajax({
                method: 'POST',
                url: '/admin/login_action',
                data: {
                    email: $('#email').val(),
                    password: $('#password').val()
                }
            })
            .done(function(msg){
                window.location = '/admin';
            })
            .fail(function(msg){
                showNotification(msg.responseJSON.message, 'danger');
            });
        }
        e.preventDefault();
    });

    $('#customerloginForm').on('click', function(e){
        if(!e.isDefaultPrevented()){
            e.preventDefault();
            $.ajax({
                method: 'POST',
                url: '/customer/login_action',
                data: {
                    loginEmail: $('#email').val(),
                    loginPassword: $('#password').val()
                }
            })
            .done(function(msg){
                window.location = '/';
            })
            .fail(function(msg){
                showNotification(msg.responseJSON.message, 'danger');
            });
        }
        e.preventDefault();
    });

    $('#customerRegister').on('click', function(e){
        window.location.replace('/customer/setup');
    });

    $('#productButtons div button').on('click', function(e){
        if($(this).text() === 'Mint') {
            var productId = $(this).attr('data-id');
            $('.modal-body #productId').val(productId);
            $('#nftMintModal').modal('show');
        } else if($(this).text() === 'Sell') {
            var productId = $(this).attr('data-id');
            $('.modal-body #sellProductId').val(productId);
            $('#sellNFTModal').modal('show');
            $('#saleEnd').datetimepicker({
                uiLibrary: 'bootstrap4',
                footer: true,
                modal: true,
                showOtherMonths: true
            });
        }
    });

    // Mint NFT
    $(document).on('click', '#buttonMint', function(e){
        $("#buttonMint").attr("disabled", true);
        $.ajax({
            method: 'POST',
            url: '/customer/product/mint',
            data: {
                productId: $('#productId').val(),
                quantity: $('#productQuantity').val()
            }
        })
        .done(function(msg){
            showNotification(msg.message, 'success', true);
            $("#buttonMint").attr("disabled", false);
        })
        .fail(function(msg){
            if(msg.responseJSON.message === 'You need to be logged in to Mint NFT'){
                showNotification(msg.responseJSON.message, 'danger', false, '/customer/products');
            }

            if(msg.responseJSON.message === 'Product not found'){
                showNotification(msg.responseJSON.message, 'danger', false, '/customer/products');
            }

            showNotification(msg.responseJSON.message, 'danger');
            $("#buttonMint").attr("disabled", false);
        });
    });

    $(document).on('click','#productSellTypeCheckbox', function(e) {
        var assetSymbol = $('#assetSymbol').val();
        if($('#productSellTypeCheckbox').prop('checked')){
            const bidHtml = `<div class="form-group">
                                <label for="productMinPrice" class="control-label">Min. Price (${assetSymbol}) *</label>
                                <input type="number" id="productMinPrice" class="form-control" min="0" step="any" required/>
                            </div>
                            <div class="form-group">
                                <label for="productMaxPrice" class="control-label">Max. Price (${assetSymbol}) *</label>
                                <input type="number" id="productMaxPrice" class="form-control" min="0" step="any" required/>
                            </div>
                            <div class="form-group">
                                <label for="saleEnd" class="control-label">Sale end date *</label>
                                <input id="saleEnd" readonly />
                            </div>`;
            $('#sellNFTFormWrapper').html(bidHtml);
            $('#saleEnd').datetimepicker({
                uiLibrary: 'bootstrap4',
                footer: true,
                modal: true,
                showOtherMonths: true
            });
        } else {
            const fixedPriceHtml = `<div class="form-group">
                                        <label for="productSellQuantity" class="control-label">Quantity *</label>
                                        <input type="number" id="productSellQuantity" class="form-control" min="0" step="1" onkeypress="return isNumberKey(event)" required/>
                                    </div>
                                    <div class="form-group">
                                        <label for="productPrice" class="control-label">NFT Price (${assetSymbol}) *</label>
                                        <input type="number" id="productPrice" class="form-control" min="0" step="any" required/>
                                    </div>
                                    <div class="form-group">
                                        <label for="saleEnd" class="control-label">Sale end date *</label>
                                        <input id="saleEnd" readonly />
                                    </div>`;
            $('#sellNFTFormWrapper').html(fixedPriceHtml);
            $('#saleEnd').datetimepicker({
                uiLibrary: 'bootstrap4',
                footer: true,
                modal: true,
                showOtherMonths: true
            });
        }
    });

    // Sell NFT
    $(document).on('click', '#buttonSell', function(e){
        const isBidding = $('#productSellTypeCheckbox').prop('checked');

        $.ajax({
            method: 'POST',
            url: '/customer/product/sell',
            data: {
                productId: $('#sellProductId').val(),
                quantity: isBidding ? 1 : $('#productSellQuantity').val(),
                minPrice: isBidding ? $('#productMinPrice').val() : $('#productPrice').val(),
                maxPrice: isBidding ? $('#productMaxPrice').val() : $('#productPrice').val(),
                expirationDate: $('#saleEnd').val()
            }
        })
        .done(function(msg){
            showNotification(msg.message, 'success', true);
        })
        .fail(function(msg){
            if(msg.responseJSON.message === 'You need to be logged in to Mint NFT'){
                showNotification(msg.responseJSON.message, 'danger', false, '/customer/products');
            }

            if(msg.responseJSON.message === 'Product not found'){
                showNotification(msg.responseJSON.message, 'danger', false, '/customer/products');
            }

            showNotification(msg.responseJSON.message, 'danger');
        });
    });

    // call update settings API
    $('#customerLogin').on('click', function(e){
        if(!e.isDefaultPrevented()){
            e.preventDefault();
            $.ajax({
                method: 'POST',
                url: '/customer/login_action',
                data: {
                    loginEmail: $('#customerLoginEmail').val(),
                    loginPassword: $('#customerLoginPassword').val()
                }
            })
            .done(function(msg){
                var customer = msg.customer;
                // Fill in customer form
                $('#shipEmail').val(customer.email);
                $('#shipFirstname').val(customer.firstName);
                $('#shipLastname').val(customer.lastName);
                $('#shipAddr1').val(customer.address1);
                $('#shipAddr2').val(customer.address2);
                $('#shipCountry').val(customer.country);
                $('#shipState').val(customer.state);
                $('#shipPostcode').val(customer.postcode);
                $('#shipPhoneNumber').val(customer.phone);
                location.reload();
            })
            .fail(function(msg){
                showNotification(msg.responseJSON.message, 'danger');
            });
        }
        e.preventDefault();
    });

    // Customer saving own details
    $('#customerSave').validator().on('click', function(e){
        e.preventDefault();
        if($('#customer-form').validator('validate').has('.has-error').length === 0){
            $.ajax({
                method: 'POST',
                url: '/customer/update',
                data: {
                    email: $('#shipEmail').val(),
                    company: $('#shipCompany').val(),
                    firstName: $('#shipFirstname').val(),
                    lastName: $('#shipLastname').val(),
                    address1: $('#shipAddr1').val(),
                    address2: $('#shipAddr2').val(),
                    country: $('#shipCountry').val(),
                    state: $('#shipState').val(),
                    postcode: $('#shipPostcode').val(),
                    phone: $('#shipPhoneNumber').val(),
                    password: $('#newCustomerPassword').val(),
                    orderComment: $('#orderComment').val()
                }
            })
            .done(function(){
                showNotification('Customer saved', 'success');
            })
            .fail(function(msg){
                showNotification(msg.responseJSON.message, 'danger');
            });
        }
    });

    $('#buttonAddFunds').validator().on('click', function(e) {
        e.preventDefault();
        var precision = parseInt($('#addFundsAssetPrecision').val());
        var amountToAdd = Math.round((parseFloat($('#amountToAdd').val()) + Number.EPSILON) * Math.pow(10, precision));
        var minAmount = Math.round((parseFloat($('#minFundsRequired').val()) + Number.EPSILON) * Math.pow(10,precision));

        if(amountToAdd < minAmount) {
            showNotification('Add more funds', 'danger');
        } else {
            window.location.replace(`/checkout/payment/${(amountToAdd/Math.pow(10, precision)).toFixed(precision)}`);
        }
    });

    $('#btnModalWithdrawFunds').validator().on('click', function(e) {
        e.preventDefault();
        var precision = parseInt($('#withdrawFundsAssetPrecision').val());
        var amountToWithdraw = Math.round((parseFloat($('#amountToWithdraw').val()) + Number.EPSILON) * Math.pow(10, precision));
        var maxAmount = Math.round((parseFloat($('#maxAmountWithdrawn').val()) + Number.EPSILON) * Math.pow(10,precision));
        var transferFees = Math.round((parseFloat($('#transferFees').val()) + Number.EPSILON) * Math.pow(10, precision));

        if(amountToWithdraw > maxAmount - transferFees) {
            showNotification('Select a lower amount', 'danger');
        } else {
            $.ajax({
                method: 'POST',
                url: '/customer/redeem',
                data: {
                    amount: amountToWithdraw,
                }
            })
            .done(function(msg){
                showNotification(msg.message, 'success', true);
            })
            .fail(function(msg){
                showNotification(msg.responseJSON.message, 'danger');
            });
        }
    });

    $(document).on('click', '.image-next', function(e){
        var thumbnails = $('.thumbnail-image');
        var index = 0;
        var matchedIndex = 0;

        // get the current src image and go to the next one
        $('.thumbnail-image').each(function(){
            if($('#product-title-image').attr('src') === $(this).attr('src')){
                if(index + 1 === thumbnails.length || index + 1 < 0){
                    matchedIndex = 0;
                }else{
                    matchedIndex = index + 1;
                }
            }
            index++;
        });

        // set the image src
        $('#product-title-image').attr('src', $(thumbnails).eq(matchedIndex).attr('src'));
    });

    $(document).on('click', '.image-prev', function(e){
        var thumbnails = $('.thumbnail-image');
        var index = 0;
        var matchedIndex = 0;

        // get the current src image and go to the next one
        $('.thumbnail-image').each(function(){
            if($('#product-title-image').attr('src') === $(this).attr('src')){
                if(index - 1 === thumbnails.length || index - 1 < 0){
                    matchedIndex = thumbnails.length - 1;
                }else{
                    matchedIndex = index - 1;
                }
            }
            index++;
        });

        // set the image src
        $('#product-title-image').attr('src', $(thumbnails).eq(matchedIndex).attr('src'));
    });

    $(document).on('change', '#product_variant', function(e){
        var variantPrice = $(this).find(':selected').attr('data-price');
        var currencySymbol = $('#currencySymbol').val();
        $('h4.product-price:first').html(currencySymbol + variantPrice);
    });

    $(document).on('click', '.add-variant-to-cart', function(e){
        $.ajax({
            method: 'POST',
            url: '/product/addtocart',
            data: {
                productId: $(this).attr('data-id'),
                productQuantity: '1',
                productVariant: $('#productVariant-' + $(this).attr('data-id')).val()
            }
        })
		    .done(function(msg){
            updateCartDiv();
            showNotification(msg.message, 'success');
        })
        .fail(function(msg){
            showNotification(msg.responseJSON.message, 'danger');
        });
    });

    $(document).on('click', '.product-add-to-cart', function(e){
        if(parseFloat($('#product_bid').val()) > parseFloat($('#maxPrice').val())){
            showNotification(`Exceeds maximum price: ${$('#maxPrice').val()}`, 'warning', false);
        } else if(parseFloat($('#product_bid').val()) < parseFloat($('#minPrice').val())) {
            showNotification(`Below minimum price: ${$('#minPrice').val()}`, 'warning', false);
        } else {
            var bidAmount = Math.round((parseFloat($('#product_bid').val()) + Number.EPSILON) * Math.pow(10, parseInt($('#addFundsAssetPrecision').val())));
            if(parseInt($('#ppyBalance').val()) < bidAmount + parseInt($('#bidFee').val())) {
                showNotification('Insufficient funds. Please add funds.', 'warning', false);
                var minFundsRequired = (bidAmount + parseInt($('#bidFee').val()) - parseInt($('#ppyBalance').val())) / Math.pow(10, parseInt($('#addFundsAssetPrecision').val()));
                $('#minFundsRequired').val(minFundsRequired);
                $('#amountToAdd').val(minFundsRequired);
                $('#addFundsModal').modal('show');
            } else {
                $.ajax({
                    method: 'POST',
                    url: '/product/bid',
                    data: {
                        productId: $('#productId').val(),
                        offerId: $('#offerId').val(),
                        productPrice: parseFloat($('#product_bid').val()).toFixed(parseInt($('#addFundsAssetPrecision').val())),
                        isBidding: $('#minPrice').val() !== $('#maxPrice').val()
                    }
                })
                .done(function(msg){
                    showNotification(msg.message, 'success');
                })
                .fail(function(msg){
                    showNotification(msg.responseJSON.message, 'danger');
                });
            }
        }
    });

    $(document).on('click', '#btnAddFunds', function(e) {
        $('#minFundsRequired').val(0);
        $('#amountToAdd').val(0);
        $('#addFundsModal').modal('show');
    });

    $(document).on('click', '#btnWithdrawFunds', function(e) {
        $('#maxAmountWithdrawn').val($(this).attr('data-balance'));
        $('#transferFees').val($(this).attr('data-fees'));
        $('#withdrawFundsModal').modal('show');
    });

    $('.cart-product-quantity').on('keyup', function(e){
        checkMaxQuantity(e, $('.cart-product-quantity'));
    });

    $('.cart-product-quantity').on('focusout', function(e){
        cartUpdate($(e.target));
    });

    $(document).on('click', '.pushy-link', function(e){
        $('body').removeClass('pushy-open-right');
    });

    // On create review
    $(document).on('click', '#add-review', function(e){
        $.ajax({
            method: 'POST',
            url: '/customer/check',
            data: {}
        })
		.done(function(msg){
            $('#reviewModal').modal('show');
        })
        .fail(function(){
            showNotification('You need to be logged in to create a review', 'danger', false, '/customer/account');
        });
    });

    // Create review
    $(document).on('click', '#addReview', function(e){
        $.ajax({
            method: 'POST',
            url: '/product/addreview',
            data: {
                product: $('#product').val(),
                title: $('#review-title').val(),
                description: $('#review-description').val(),
                rating: $('#review-rating').val()
            }
        })
		.done(function(msg){
            showNotification(msg.message, 'success', true);
        })
        .fail(function(msg){
            if(msg.responseJSON.message === 'You need to be logged in to create a review'){
                showNotification(msg.responseJSON.message, 'danger', false, '/customer/account');
            }
            showNotification(msg.responseJSON.message, 'danger');
        });
    });

    // On empty cart click
    $(document).on('click', '#empty-cart', function(e){
        $('#confirmModal').modal('show');
        $('#buttonConfirm').attr('data-func', 'emptyCart');
    });

    $(document).on('click', '#buttonConfirm', function(e){
        // Get the function and run it
        var func = $(e.target).attr('data-func');
        window[func]();
        $('#confirmModal').modal('hide');
    });

    $('.qty-btn-minus').on('click', function(){
        if(parseInt($('#product_bid').val()) - 1 >= parseFloat($('#minPrice').val())){
            var number = parseInt($('#product_bid').val()) - 1;
            $('#product_bid').val(number > 0 ? number : 1);
        }
    });

    $('.qty-btn-plus').on('click', function(){
        if(parseInt($('#product_bid').val()) + 1 <= parseFloat($('#maxPrice').val())){
            $('#product_bid').val(parseInt($('#product_bid').val()) + 1);
        }
    });

    // product thumbnail image click
    $('.thumbnail-image').on('click', function(){
        $('#product-title-image').attr('src', $(this).attr('src'));
    });

    // resets the order filter
    $(document).on('click', '#btn_search_reset', function(e){
        window.location.replace('/');
    });

    // search button click event
    $(document).on('click', '#btn_search', function(e){
        e.preventDefault();
        if($('#frm_search').val().trim() === ''){
            showNotification('Please enter a search value', 'danger');
        }else{
            window.location.href = '/search/' + $('#frm_search').val();
        }
    });

    if($('#input_notify_message').val() !== ''){
		// save values from inputs
        var messageVal = $('#input_notify_message').val();
        var messageTypeVal = $('#input_notify_messageType').val();

		// clear inputs
        $('#input_notify_message').val('');
        $('#input_notify_messageType').val('');

		// alert
        showNotification(messageVal, messageTypeVal || 'danger', false);
    }

    // checkout-blockonomics page (blockonomics_payment route) handling START ***
    if($('#blockonomics_div').length > 0){
        var orderid = $('#blockonomics_div').data('orderid') || '';
        var timestamp = $('#blockonomics_div').data('timestamp') || -1;
        var address = $('#blockonomics_div').data('address') || '';
        var blSocket = new WebSocket('wss://www.blockonomics.co/payment/' + address + '?timestamp=' + timestamp);
        blSocket.onopen = function (msg){
        };
        var timeOutMinutes = 10;
        setTimeout(function (){
            $('#blockonomics_waiting').html('<b>Payment expired</b><br><br><b><a href=\'/checkout/payment\'>Click here</a></b> to try again.<br><br>If you already paid, your order will be processed automatically.');
            showNotification('Payment expired', 'danger');
            blSocket.close();
        }, 1000 * 60 * timeOutMinutes);

        var countdownel = $('#blockonomics_timeout');
        var endDatebl = new Date((new Date()).getTime() + 1000 * 60 * timeOutMinutes);
        var blcountdown = setInterval(function (){
            var now = new Date().getTime();
            var distance = endDatebl - now;
            if(distance < 0){
                clearInterval(blcountdown);
                return;
            }
            var minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            var seconds = Math.floor((distance % (1000 * 60)) / 1000);
            countdownel.html(minutes + 'm ' + seconds + 's');
        }, 1000);

        blSocket.onmessage = function (msg){
            var data = JSON.parse(msg.data);
            if((data.status === 0) || (data.status === 1) || (data.status === 2)){
                // redirect to order confirmation page
                var orderMessage = '<br>View <b><a href="/payment/' + orderid + '">Order</a></b>';
                $('#blockonomics_waiting').html('Payment detected (<b>' + data.value / 1e8 + ' BTC</b>).' + orderMessage);
                showNotification('Payment detected', 'success');
                $('#cart-count').html('0');
                blSocket.close();
                $.ajax({ method: 'POST', url: '/product/emptycart' }).done(function (){
                    window.location.replace('/payment/' + orderid);
                });
            }
        };
    }
    // checkout-blockonomics page (blockonomics_payment route) handling ***  END
});

function checkMaxQuantity(e, element){
    if($('#maxQuantity').length){
        if(e.keyCode === 46 || e.keyCode === 8){
            return;
        }
        if(parseInt($(e.target).val()) > parseInt($('#maxQuantity').val())){
            const qty = element.val();
            e.preventDefault();
            element.val(qty.slice(0, -1));
            showNotification(`Exceeds maximum quantity: ${$('#maxQuantity').val()}`, 'warning', false);
        }
    }
}

function checkMinMaxPrice(e, element){
  if($('#maxPrice').length && $('#minPrice').length){
      if(e.keyCode === 46 || e.keyCode === 8){
          return;
      }
      if(parseFloat($(e.target).val()) > parseFloat($('#maxPrice').val())){
          const qty = element.val();
          e.preventDefault();
          element.val(qty.slice(0, -1));
          showNotification(`Exceeds maximum price: ${$('#maxPrice').val()}`, 'warning', false);
      } else if(parseFloat($(e.target).val()) < parseFloat($('#minPrice').val())) {
          const qty = element.val();
          e.preventDefault();
          element.val(qty.slice(0, -1));
          showNotification(`Below minimum price: ${$('#minPrice').val()}`, 'warning', false);
      }
  }
}

function deleteFromCart(element){
    $.ajax({
        method: 'POST',
        url: '/product/removefromcart',
        data: {
            cartId: element.attr('data-cartid')
        }
    })
    .done(function(msg){
        updateCartDiv();
        showNotification(msg.message, 'success');
    })
    .fail(function(msg){
        showNotification(msg.responseJSON.message, 'danger');
    });
}

function cartUpdate(element){
    if($(element).val() > 0){
        if($(element).val() !== ''){
            updateCart(element);
        }
    }else{
        $(element).val(1);
    }
}

function updateCart(element){
    // update cart on server
    $.ajax({
        method: 'POST',
        url: '/product/updatecart',
        data: {
            cartId: element.attr('data-cartid'),
            productId: element.attr('data-id'),
            quantity: element.val()
        }
    })
    .done(function(msg){
        updateCartDiv();
    })
    .fail(function(msg){
        showNotification(msg.responseJSON.message, 'danger', true);
    });
}

function updateCartDiv(){
    $.ajax({
        method: 'GET',
        url: '/checkout/cartdata'
    })
    .done(function(result){
        // Update the cart div
        var cart = result.cart;
        var session = result.session;
        var productHtml = '';
        var totalAmount = numeral(session.totalCartAmount).format('0.00');

        // Work out the shipping
        var shippingTotalAmt = numeral(session.totalCartShipping).format('0.00');
        var shippingTotal = `${session.shippingMessage} :<strong id="shipping-amount">${result.currencySymbol}${shippingTotalAmt}</strong>`;
        if(session.totalCartShipping === 0){
            shippingTotal = `<span id="shipping-amount">${session.shippingMessage}</span>`;
        }

        var discountTotalAmt = numeral(session.totalCartDiscount).format('0.00');
        var discountTotal = '';
        if(session.totalCartDiscount > 0){
            discountTotal = `
                <div class="text-right">
                    Discount: <strong id="discount-amount">${result.currencySymbol}${discountTotalAmt}</strong>
                </div>`;
        }

        // If the cart has contents
        if(cart){
            $('#cart-empty').empty();
            Object.keys(cart).forEach(function(cartId){
                var item = cart[cartId];
                // Setup the product
                var productTotalAmount = numeral(item.totalItemPrice).format('0.00');
                var variantHtml = '';
                if(item.variantId){
                    variantHtml += `<strong>Option:</strong> ${item.variantTitle}`;
                }
                var productImage = `<img class="img-fluid" src="/uploads/placeholder.png" alt="${item.title} product image"></img>`;
                if(item.productImage){
                    productImage = `<img class="img-fluid" src="${item.productImage}" alt="${item.title} product image"></img>`;
                }

                // Setup the product html
                productHtml += `
                <div class="d-flex flex-row bottom-pad-15">
                    <div class="p-2 cart-product">
                        <div class="row h-200">
                            <div class="col-4 col-md-3 no-pad-left">
                                ${productImage}
                            </div>
                            <div class="col-8 col-md-9">
                                <div class="row">
                                    <div class="col-12 no-pad-left mt-md-4">
                                        <h6><a href="/product/${item.link}">${item.title}</a></h6>
                                        ${variantHtml}
                                    </div>
                                    <div class="col-12 col-md-6 no-pad-left mb-2">
                                        <div class="input-group">
                                            <div class="input-group-prepend">
                                                <button class="btn btn-primary btn-qty-minus" type="button">-</button>
                                            </div>
                                            <input 
                                                type="number" 
                                                class="form-control cart-product-quantity text-center"
                                                data-cartid="${cartId}"
                                                data-id="${item.productId}" 
                                                maxlength="2" 
                                                value="${item.quantity}"
                                            >
                                            <div class="input-group-append">
                                                <button class="btn btn-primary btn-qty-add" type="button">+</button>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-4 col-md-2 no-pad-left">
                                        <button class="btn btn-danger btn-delete-from-cart" data-cartid="${cartId}" type="button"><i class="feather" data-feather="trash-2" data-cartid="${cartId}"></i></button>
                                    </div>
                                    <div class="col-8 col-md-4 align-self-center text-right">
                                        <strong class="my-auto">${result.currencySymbol}${productTotalAmount}</strong>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
            });

            $('.cartBodyWrapper').html(productHtml);
        }else{
            $('.cartBodyWrapper').html('');
        }

        $('#cart-count').text(session.totalCartItems);

        // Set the totals section
        var cartTotalsHtml = `
            <div class="d-flex flex-row">
                <div class="cart-contents-shipping col-md-12 no-pad-right">
                    <div class="text-right">
                        ${shippingTotal}
                    </div>
                    ${discountTotal}
                    <div class="text-right">
                        Total:
                        <strong id="total-cart-amount">${result.currencySymbol}${totalAmount}</strong>
                    </div>
                </div>
            </div>`;

        var cartTotalsEmptyHtml = `
            <div id="cart-empty" class="d-flex flex-row">
                <div class="cart-contents-shipping col-md-12 no-pad-left>
                    Cart empty
                </div>
            </div>`;

        // Set depending on cart contents
        if(cart){
            $('.cartTotalsWrapper').html(cartTotalsHtml);
            $('.cart-buttons').removeClass('d-none');
        }else{
            $('.cartTotalsWrapper').html(cartTotalsEmptyHtml);
            $('.cart-buttons').addClass('d-none');
        }
        feather.replace();
    })
    .fail(function(result){
        showNotification(result.responseJSON.message, 'danger');
    });
}

// eslint-disable-next-line no-unused-vars
function emptyCart(){
    $.ajax({
        method: 'POST',
        url: '/product/emptycart'
    })
    .done(function(msg){
        updateCartDiv();
        showNotification(msg.message, 'success', true);
    });
}

function validationErrors(errors){
  var errorMessage = '';
  errors.forEach((value) => {
      errorMessage += `<p>${value.dataPath.replace('/', '')} - <span class="text-danger">${value.message}<span></p>`;
  });
  return errorMessage;
}

function isNumberKey(evt){
    var charCode = (evt.which) ? evt.which : evt.keyCode
    if (charCode > 31 && (charCode < 48 || charCode > 57))
        return false;
    return true;
}