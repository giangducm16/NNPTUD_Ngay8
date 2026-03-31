const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: "sandbox.smtp.mailtrap.io",
    port: 25,
    secure: false, // Use true for port 465, false for port 587
    auth: {
        user: "01d3cc06ba0d67",
        pass: "40c97702b2305c",
    },
});

module.exports = {
    sendMail: async function (to, url) {
        await transporter.sendMail({
            from: 'admin@haha.com',
            to: to,
            subject: "reset password email",
            text: "click vao day de doi pass",
            html: "click vao <a href=" + url + ">day</a> de doi pass",
        })
    },
    sendPasswordMail: async function (to, username, password) {
        await transporter.sendMail({
            from: 'admin@haha.com',
            to: to,
            subject: "Tài khoản của bạn đã được tạo",
            text: `Xin chào ${username},\n\nTài khoản của bạn đã được tạo.\nUsername: ${username}\nPassword: ${password}\n\nVui lòng đổi mật khẩu sau khi đăng nhập.`,
            html: `
                <h2>Xin chào <b>${username}</b>,</h2>
                <p>Tài khoản của bạn đã được tạo thành công.</p>
                <table border="1" cellpadding="8" cellspacing="0">
                    <tr><td><b>Username</b></td><td>${username}</td></tr>
                    <tr><td><b>Password</b></td><td><code>${password}</code></td></tr>
                </table>
                <p style="color:red;">Vui lòng đổi mật khẩu ngay sau khi đăng nhập!</p>
            `,
        })
    }
}

// Send an email using async/await
