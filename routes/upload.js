let express = require('express')
let router = express.Router()
let { uploadImage, uploadExcel } = require('../utils/uploadHandler')
let path = require('path')
let exceljs = require('exceljs')
let fs = require('fs')
let crypto = require('crypto')
let categoriesModel = require('../schemas/categories')
let productsModel = require('../schemas/products')
let inventoryModel = require('../schemas/inventories')
let usersModel = require('../schemas/users')
let rolesModel = require('../schemas/roles')
let mongoose = require('mongoose')
let slugify = require('slugify')
let { sendPasswordMail } = require('../utils/sendMail')

router.post('/one_image', uploadImage.single('file'), function (req, res, next) {
    if (!req.file) {
        res.status(404).send({
            message: "file not found"
        })
    } else {
        console.log(req.body);
        res.send({
            filename: req.file.filename,
            path: req.file.path,
            size: req.file.size
        })
    }
})
router.post('/multiple_images', uploadImage.array('files', 5), function (req, res, next) {
    if (!req.files) {
        res.status(404).send({
            message: "file not found"
        })
    } else {
        console.log(req.body);
        res.send(req.files.map(f => ({
            filename: f.filename,
            path: f.path,
            size: f.size
        })))
    }
})
router.get('/:filename', function (req, res, next) {
    let pathFile = path.join(
        __dirname, '../uploads', req.params.filename
    )
    res.sendFile(pathFile)
})

router.post('/excel', uploadExcel.single('file'), async function (req, res, next) {
    if (!req.file) {
        res.status(404).send({
            message: "file not found"
        })
    } else {
        //workbook->worksheet->column/row->cell
        let workbook = new exceljs.Workbook();
        let pathFile = path.join(
            __dirname, '../uploads', req.file.filename
        )
        await workbook.xlsx.readFile(pathFile)
        let worksheet = workbook.worksheets[0];
        let result = []
        let categories = await categoriesModel.find({
        });
        let categoriesMap = new Map();
        for (const category of categories) {
            categoriesMap.set(category.name, category._id)
        }
        let products = await productsModel.find({})
        let getTitle = products.map(p => p.title)
        let getSku = products.map(p => p.sku)

        for (let index = 2; index <= worksheet.rowCount; index++) {
            let errorsInRow = []
            const element = worksheet.getRow(index);
            let sku = element.getCell(1).value;
            let title = element.getCell(2).value;
            let category = element.getCell(3).value;

            let price = Number.parseInt(element.getCell(4).value)
            let stock = Number.parseInt(element.getCell(5).value)

            if (price < 0 || isNaN(price)) {
                errorsInRow.push("price khong hop le")
            }
            if (stock < 0 || isNaN(stock)) {
                errorsInRow.push("stock khong hop le")
            }
            if (!categoriesMap.has(category)) {
                errorsInRow.push('category khong hop le')
            }
            if (getSku.includes(sku)) {
                errorsInRow.push('sku bi trung')
            }
            if (getTitle.includes(title)) {
                errorsInRow.push('title khong hop le')
            }
            if (errorsInRow.length > 0) {
                result.push({
                    success: false,
                    data: errorsInRow
                });
                continue;
            }// 

            let session = await mongoose.startSession();
            session.startTransaction()
            try {
                let newProduct = new productsModel({
                    sku: sku,
                    title: title,
                    slug: slugify(title, {
                        replacement: '-',
                        remove: undefined,
                        lower: true,
                        strict: false,
                    }),
                    price: price,
                    description: title,
                    category: categoriesMap.get(category)
                });
                newProduct = await newProduct.save({ session });
                let newInventory = new inventoryModel({
                    product: newProduct._id,
                    stock: stock
                })
                newInventory = await newInventory.save({ session });
                newInventory = await newInventory.populate('product')
                await session.commitTransaction();
                await session.endSession()
                getTitle.push(title);
                getSku.push(sku)
                result.push({
                    success: true,
                    data: newInventory
                })
            } catch (error) {
                await session.abortTransaction();
                await session.endSession()
                result.push({
                    success: false,
                    data: error.message
                })
            }

        }
        fs.unlinkSync(pathFile)
        res.send(result.map(function (r, index) {
            if (r.success) {
                return { [index + 1]: r.data }
            } else {
                return { [index + 1]: r.data.join(',') }
            }
        }))
    }
})

// Xóa users bị import lỗi (email = "[object Object]")
router.delete('/users/cleanup', async function (req, res, next) {
    try {
        let deleted = await usersModel.deleteMany({ email: "[object Object]" })
        res.send({ message: `Đã xóa ${deleted.deletedCount} users lỗi` })
    } catch (err) {
        next(err)
    }
})

router.post('/users', uploadExcel.single('file'), async function (req, res, next) {
    if (!req.file) {
        return res.status(404).send({ message: "file not found" })
    }
    try {
        let workbook = new exceljs.Workbook()
        let pathFile = path.join(__dirname, '../uploads', req.file.filename)
        await workbook.xlsx.readFile(pathFile)
        let worksheet = workbook.worksheets[0]

        // Tìm role "user"
        let userRole = await rolesModel.findOne({ name: 'user' })
        if (!userRole) {
            fs.unlinkSync(pathFile)
            return res.status(400).send({ message: "Role 'user' không tồn tại trong DB" })
        }

        let result = []
        for (let index = 2; index <= worksheet.rowCount; index++) {
            const row = worksheet.getRow(index)
            let username = row.getCell(1).value
            let email = row.getCell(2).value

            // Bỏ qua dòng rỗng
            if (!username || !email) {
                result.push({ row: index, success: false, error: 'username hoặc email bị rỗng' })
                continue
            }

            // Xử lý ExcelJS hyperlink/rich-text object -> lấy text thực
            if (typeof username === 'object') username = username.text || username.richText?.map(r => r.text).join('') || String(username)
            if (typeof email === 'object') email = email.text || email.hyperlink || email.richText?.map(r => r.text).join('') || String(email)

            username = String(username).trim()
            email = String(email).trim()

            // Kiểm tra trùng
            let existed = await usersModel.findOne({ $or: [{ username }, { email }] })
            if (existed) {
                result.push({ row: index, success: false, error: `username hoặc email đã tồn tại: ${username} / ${email}` })
                continue
            }

            // Sinh password random 16 ký tự
            let rawPassword = crypto.randomBytes(12).toString('base64').slice(0, 16)

            try {
                let newUser = new usersModel({
                    username,
                    email,
                    password: rawPassword,
                    role: userRole._id,
                    status: true
                })
                await newUser.save()

                // Gửi email (không fail user nếu mail lỗi)
                let mailStatus = 'sent'
                try {
                    await sendPasswordMail(email, username, rawPassword)
                } catch (mailErr) {
                    mailStatus = 'mail_error: ' + mailErr.message
                }

                result.push({ row: index, success: true, username, email, mailStatus })
            } catch (err) {
                result.push({ row: index, success: false, error: err.message })
            }
        }

        fs.unlinkSync(pathFile)
        res.send({
            message: `Import hoàn tất: ${result.filter(r => r.success).length} thành công, ${result.filter(r => !r.success).length} thất bại`,
            result
        })
    } catch (err) {
        next(err)
    }
})

module.exports = router;