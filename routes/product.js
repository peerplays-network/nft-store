const express = require('express');
const { restrict, checkAccess } = require('../lib/auth');
const {
    getId,
    clearSessionValue,
    cleanHtml,
    convertBool,
    checkboxBool,
    safeParseInt,
    getImages
} = require('../lib/common');
const { indexProducts } = require('../lib/indexing');
const { validateJson } = require('../lib/schema');
const { paginateData } = require('../lib/paginate');
const colors = require('colors');
const rimraf = require('rimraf');
const fs = require('fs');
const path = require('path');
const PeerplaysService = require('../services/PeerplaysService');
const router = express.Router();
const config = require('../config/settings');
const multer = require('multer');

const randomizeLottoName = () => {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  for (let i = 0; i < 10; i++) { text += possible.charAt(Math.floor(Math.random() * possible.length)); }

  return text;
};

// Config multer for using inside upload middleware
const imgStorage = multer.diskStorage({
  destination: (req, file, cb) => {
      cb(null, path.join(__dirname, '../uploads'))
  },
  filename: (req, file, cb) => {
      cb(null, new Date().toISOString().replace(/[\/\\:.]/g, "_") + '-' + file.originalname)
  }
});

// Create an image filter
const imgfileFilter = (req, file, cb) => {
  if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
      cb(null, true);
  } else {
      cb(null, false);
  }
}

// Create an upload middleware
const upload = multer({
  storage: imgStorage,
  fileFilter: imgfileFilter,
  limits: {
      fieldSize: 1024 * 1024 * 2
  }
});

router.get('/customer/products/:page?', async (req, res, next) => {
    let pageNum = 1;
    if(req.params.page){
        pageNum = req.params.page;
    }

    // Get our paginated data
    const products = await paginateData(false, req, pageNum, 'products', {}, { productAddedDate: -1 });

    res.render('products', {
        title: 'Cart - Products',
        results: products.data,
        totalItemCount: products.totalItems,
        pageNum,
        paginateUrl: 'customer/products',
        resultType: 'top',
        session: req.session,
        admin: true,
        config: req.app.config,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers
    });
});

router.get('/customer/products/filter/:search', async (req, res, next) => {
    const db = req.app.db;
    const searchTerm = req.params.search;
    const productsIndex = req.app.productsIndex;

    const lunrIdArray = [];
    productsIndex.search(searchTerm).forEach((id) => {
        lunrIdArray.push(getId(id.ref));
    });

    // we search on the lunr indexes
    const results = await db.products.find({ _id: { $in: lunrIdArray } }).toArray();

    if(req.apiAuthenticated){
        res.status(200).json(results);
        return;
    }

    res.render('products', {
        title: 'Results',
        results: results,
        resultType: 'filtered',
        admin: true,
        config: req.app.config,
        session: req.session,
        searchTerm: searchTerm,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers
    });
});

// insert form
router.get('/customer/product/new', (req, res) => {
    if(!req.session.peerIDAccessToken) {
        res.redirect('/customer/login');
        return;
    }

    res.render('product-new', {
        title: 'New NFT',
        session: req.session,
        productTitle: clearSessionValue(req.session, 'productTitle'),
        productDescription: clearSessionValue(req.session, 'productDescription'),
        productPermalink: clearSessionValue(req.session, 'productPermalink'),
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        editor: true,
        helpers: req.handlebars.helpers,
        config: req.app.config
    });
});

// insert new product form action
router.post('/customer/product/insert', upload.single("productImage"), async (req, res) => {
    const db = req.app.db;
    let filePath = '';

    const doc = {
        nftMetadataID: "1.26.0",
        productDescription: req.body.productDescription,
        productCategory: req.body.productCategory,
        productPublished: req.body.productPublished == 'true',
        productPermalink: req.body.productPermalink
    };

    if(req.file) {
        filePath = req.file.path;
    }

    // Validate the body again schema
    const schemaValidate = validateJson('newProduct', doc);
    if(!schemaValidate.result){
        if(process.env.NODE_ENV !== 'test'){
            console.log('schemaValidate errors', schemaValidate.errors);
        }
        res.status(400).json(schemaValidate.errors);
        return;
    }

    const body = {
        operations: [{
            op_name: 'nft_metadata_create',
            fee_asset: config.peerplaysAssetID,
            owner: req.session.peerplaysAccountId,
            name: req.body.title,
            symbol: randomizeLottoName(),
            base_uri: filePath,
            revenue_partner: config.peerplaysAccountID,
            revenue_split: config.commission * 100,
            is_transferable: false,
            is_sellable: true
        }]
    };

    let peerplaysResult = null;
    try{
        peerplaysResult = await new PeerplaysService().sendOperations(body, req.session.peerIDAccessToken);
    } catch(ex) {
        res.status(400).json({ message: ex.message });
        return;
    }

    doc.nftMetadataID = peerplaysResult.result.trx.operation_results[0][1];

    try{
        const newDoc = await db.products.insertOne(doc);
        // get the new ID
        const newId = newDoc.insertedId;

        // add to lunr index
        indexProducts(req.app)
        .then(() => {
            res.status(200).json({
                message: 'New product successfully created',
                productId: newId
            });
        });
    }catch(ex){
        console.log(colors.red(`Error inserting document: ${ex}`));
        res.status(400).json({ message: 'Error inserting document' });
    }
});

// render the editor
router.get('/customer/product/edit/:id', async (req, res) => {
    const db = req.app.db;

    const images = await getImages(req.params.id, req, res);
    const product = await db.products.findOne({ _id: getId(req.params.id) });
    if(!product){
        // If API request, return json
        if(req.apiAuthenticated){
            res.status(400).json({ message: 'Product not found' });
            return;
        }
        req.session.message = 'Product not found';
        req.session.messageType = 'danger';
        res.redirect('/customer/products');
        return;
    }

    // Get variants
    product.variants = await db.variants.find({ product: getId(req.params.id) }).toArray();

    // If API request, return json
    if(req.apiAuthenticated){
        res.status(200).json(product);
        return;
    }

    res.render('product-edit', {
        title: 'Edit product',
        result: product,
        images: images,
        admin: true,
        session: req.session,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        config: req.app.config,
        editor: true,
        helpers: req.handlebars.helpers
    });
});

// // Add a variant to a product
// router.post('/admin/product/addvariant', restrict, checkAccess, async (req, res) => {
//     const db = req.app.db;

//     const variantDoc = {
//         product: req.body.product,
//         title: req.body.title,
//         price: req.body.price,
//         stock: safeParseInt(req.body.stock) || null
//     };

//     // Validate the body again schema
//     const schemaValidate = validateJson('newVariant', variantDoc);
//     if(!schemaValidate.result){
//         if(process.env.NODE_ENV !== 'test'){
//             console.log('schemaValidate errors', schemaValidate.errors);
//         }
//         res.status(400).json(schemaValidate.errors);
//         return;
//     }

//     // Check product exists
//     const product = await db.products.findOne({ _id: getId(req.body.product) });

//     if(!product){
//         console.log('here1?');
//         res.status(400).json({ message: 'Failed to add product variant' });
//         return;
//     }

//     // Fix values
//     variantDoc.product = getId(req.body.product);
//     variantDoc.added = new Date();

//     try{
//         const variant = await db.variants.insertOne(variantDoc);
//         product.variants = variant.ops;
//         res.status(200).json({ message: 'Successfully added variant', product });
//     }catch(ex){
//         console.log('here?');
//         res.status(400).json({ message: 'Failed to add variant. Please try again' });
//     }
// });

// // Update an existing product variant
// router.post('/admin/product/editvariant', restrict, checkAccess, async (req, res) => {
//     const db = req.app.db;

//     const variantDoc = {
//         product: req.body.product,
//         variant: req.body.variant,
//         title: req.body.title,
//         price: req.body.price,
//         stock: safeParseInt(req.body.stock) || null
//     };

//     // Validate the body again schema
//     const schemaValidate = validateJson('editVariant', variantDoc);
//     if(!schemaValidate.result){
//         if(process.env.NODE_ENV !== 'test'){
//             console.log('schemaValidate errors', schemaValidate.errors);
//         }
//         res.status(400).json(schemaValidate.errors);
//         return;
//     }

//     // Validate ID's
//     const product = await db.products.findOne({ _id: getId(req.body.product) });
//     if(!product){
//         res.status(400).json({ message: 'Failed to add product variant' });
//         return;
//     }

//     const variant = await db.variants.findOne({ _id: getId(req.body.variant) });
//     if(!variant){
//         res.status(400).json({ message: 'Failed to add product variant' });
//         return;
//     }

//     // Removed props not needed
//     delete variantDoc.product;
//     delete variantDoc.variant;

//     try{
//         const updatedVariant = await db.variants.findOneAndUpdate({
//             _id: getId(req.body.variant)
//         }, {
//             $set: variantDoc
//         }, {
//             returnOriginal: false
//         });
//         res.status(200).json({ message: 'Successfully saved variant', variant: updatedVariant.value });
//     }catch(ex){
//         res.status(400).json({ message: 'Failed to save variant. Please try again' });
//     }
// });

// // Remove a product variant
// router.post('/admin/product/removevariant', restrict, checkAccess, async (req, res) => {
//     const db = req.app.db;

//     const variant = await db.variants.findOne({ _id: getId(req.body.variant) });
//     if(!variant){
//         res.status(400).json({ message: 'Failed to remove product variant' });
//         return;
//     }

//     try{
//         // Delete the variant
//         await db.variants.deleteOne({ _id: variant._id }, {});
//         res.status(200).json({ message: 'Successfully removed variant' });
//     }catch(ex){
//         res.status(400).json({ message: 'Failed to remove variant. Please try again' });
//     }
// });

// Update an existing product form action
router.post('/customer/product/update', async (req, res) => {
    const db = req.app.db;

    const product = await db.products.findOne({ _id: getId(req.body.productId) });

    if(!product){
        res.status(400).json({ message: 'Failed to update product' });
        return;
    }
    const count = await db.products.countDocuments({ productPermalink: req.body.productPermalink, _id: { $ne: getId(product._id) } });
    if(count > 0 && req.body.productPermalink !== ''){
        res.status(400).json({ message: 'Permalink already exists. Pick a new one.' });
        return;
    }

    const images = await getImages(req.body.productId, req, res);
    const productDoc = {
        productId: req.body.productId,
        productPermalink: req.body.productPermalink,
        productTitle: cleanHtml(req.body.productTitle),
        productPrice: req.body.productPrice,
        productDescription: cleanHtml(req.body.productDescription),
        productGtin: cleanHtml(req.body.productGtin),
        productBrand: cleanHtml(req.body.productBrand),
        productPublished: convertBool(req.body.productPublished),
        productTags: req.body.productTags,
        productComment: checkboxBool(req.body.productComment),
        productStock: safeParseInt(req.body.productStock) || null,
        productStockDisable: convertBool(req.body.productStockDisable)
    };

    // Validate the body again schema
    const schemaValidate = validateJson('editProduct', productDoc);
    if(!schemaValidate.result){
        res.status(400).json(schemaValidate.errors);
        return;
    }

    // Remove productId from doc
    delete productDoc.productId;

    // if no featured image
    if(!product.productImage){
        if(images.length > 0){
            productDoc.productImage = images[0].path;
        }else{
            productDoc.productImage = '/uploads/placeholder.png';
        }
    }else{
        productDoc.productImage = product.productImage;
    }

    try{
        await db.products.updateOne({ _id: getId(req.body.productId) }, { $set: productDoc }, {});
        // Update the index
        indexProducts(req.app)
        .then(() => {
            res.status(200).json({ message: 'Successfully saved', product: productDoc });
        });
    }catch(ex){
        res.status(400).json({ message: 'Failed to save. Please try again' });
    }
});

// delete a product
router.post('/customer/product/delete', async (req, res) => {
    const db = req.app.db;

    // remove the product
    await db.products.deleteOne({ _id: getId(req.body.productId) }, {});

    // Remove the variants
    await db.variants.deleteMany({ product: getId(req.body.productId) }, {});

    // delete any images and folder
    rimraf(`public/uploads/${req.body.productId}`, (err) => {
        if(err){
            console.info(err.stack);
            res.status(400).json({ message: 'Failed to delete product' });
        }

        // re-index products
        indexProducts(req.app)
        .then(() => {
            res.status(200).json({ message: 'Product successfully deleted' });
        });
    });
});

// update the published state based on an ajax call from the frontend
router.post('/admin/product/publishedState', restrict, checkAccess, async (req, res) => {
    const db = req.app.db;

    try{
        await db.products.updateOne({ _id: getId(req.body.id) }, { $set: { productPublished: convertBool(req.body.state) } }, { multi: false });
        res.status(200).json({ message: 'Published state updated' });
    }catch(ex){
        console.error(colors.red(`Failed to update the published state: ${ex}`));
        res.status(400).json({ message: 'Published state not updated' });
    }
});

// set as main product image
router.post('/admin/product/setasmainimage', restrict, checkAccess, async (req, res) => {
    const db = req.app.db;

    try{
        // update the productImage to the db
        await db.products.updateOne({ _id: getId(req.body.product_id) }, { $set: { productImage: req.body.productImage } }, { multi: false });
        res.status(200).json({ message: 'Main image successfully set' });
    }catch(ex){
        res.status(400).json({ message: 'Unable to set as main image. Please try again.' });
    }
});

// deletes a product image
router.post('/admin/product/deleteimage', restrict, checkAccess, async (req, res) => {
    const db = req.app.db;

    // get the productImage from the db
    const product = await db.products.findOne({ _id: getId(req.body.product_id) });
    if(!product){
        res.status(400).json({ message: 'Product not found' });
        return;
    }
    if(req.body.productImage === product.productImage){
        // set the productImage to null
        await db.products.updateOne({ _id: getId(req.body.product_id) }, { $set: { productImage: null } }, { multi: false });

        // remove the image from disk
        fs.unlink(path.join('public', req.body.productImage), (err) => {
            if(err){
                res.status(400).json({ message: 'Image not removed, please try again.' });
            }else{
                res.status(200).json({ message: 'Image successfully deleted' });
            }
        });
    }else{
        // remove the image from disk
        fs.unlink(path.join('public', req.body.productImage), (err) => {
            if(err){
                res.status(400).json({ message: 'Image not removed, please try again.' });
            }else{
                res.status(200).json({ message: 'Image successfully deleted' });
            }
        });
    }
});

module.exports = router;
