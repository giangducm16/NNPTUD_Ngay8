let express = require('express');
let router = express.Router();
let mongoose = require('mongoose');
let messageModel = require('../schemas/messages');
let { CheckLogin } = require('../utils/authHandler');
let multer = require('multer');
let path = require('path');

let storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        let ext = path.extname(file.originalname);
        let newFileName = Date.now() + '-' + Math.round(Math.random() * 1E9) + ext;
        cb(null, newFileName);
    }
});
let uploadFile = multer({ storage: storage });

// get "/:userID" - lấy toàn bộ message từ user hiện tại tới userID và từ userID tới user hiện tại
router.get('/:userID', CheckLogin, async function (req, res, next) {
    try {
        let currentUserId = req.user._id;
        let userID = req.params.userID;

        // Tránh lỗi khi params.userID là chữ / chuỗi rỗng
        if (userID === "") {
            return res.status(404).send("userID is required");
        }

        let messages = await messageModel.find({
            $or: [
                { from: currentUserId, to: userID },
                { from: userID, to: currentUserId }
            ]
        }).sort({ createdAt: 1 });
        res.send(messages);
    } catch (error) {
        res.status(404).send(error.message);
    }
});

// post "/" - post nội dung. Có file thì type = file, text = path. Text thì type = text, text = nội dung
router.post('/', CheckLogin, uploadFile.single('file'), async function (req, res, next) {
    try {
        let currentUserId = req.user._id;
        let { to, text } = req.body;
        
        let msgType = 'text';
        let msgText = text;

        if (req.file) {
            msgType = 'file';
            msgText = req.file.path.replace(/\\/g, "/");
        }
        
        let newMessage = new messageModel({
            from: currentUserId,
            to: to,
            messageContent: {
                type: msgType,
                text: msgText
            }
        });
        
        await newMessage.save();
        res.send(newMessage);
    } catch (error) {
        res.status(404).send(error.message);
    }
});

// get "/" - lấy message cuối cùng của mỗi user mà user hiện tại nhắn tin hoặc nhận
router.get('/', CheckLogin, async function (req, res, next) {
    try {
        let currentUserId = req.user._id;
        
        // Lấy tất cả tin nhắn chứa user hiện tại, sort giảm dần theo thời gian
        let allMessages = await messageModel.find({
            $or: [
                { from: currentUserId },
                { to: currentUserId }
            ]
        })
        .sort({ createdAt: -1 })
        .populate("from to", "username fullName avatarUrl email");

        let contactMap = new Map();
        
        // Duyệt qua mảng tin nhắn đã được sắp xếp giảm dần (mới nhất nằm trước)
        for (let msg of allMessages) {
            // Xác định ID của đối phương (nếu from là user hiện tại thì lấy to, ngược lại lấy from)
            let contactId = msg.from._id.toString() === currentUserId.toString() 
                ? msg.to._id.toString() 
                : msg.from._id.toString();
                
            // Nếu liên hệ này chưa có trong Map => Đây là tin nhắn mới nhất
            if (!contactMap.has(contactId)) {
                contactMap.set(contactId, msg);
            }
        }
        
        // Chuyển kết quả từ Map sang Array
        let messages = Array.from(contactMap.values());
        
        res.send(messages);
    } catch (error) {
        res.status(404).send(error.message);
    }
});

module.exports = router;
