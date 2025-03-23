require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(bodyParser.json());

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

// User schema
const UserSchema = new mongoose.Schema({
    name: String,
    phone: String,
    password: String,
});

const ApplicationSchema = new mongoose.Schema({
    fullnames: String,
    phone: String,
    idnumber: String,
    county: String,
    subcounty: String,
    ward: String,
    location: String,
    village: String,
});

const User = mongoose.model("User", UserSchema);
const Application = mongoose.model("Application", ApplicationSchema);

// **Register User**
app.post("/register", async (req, res) => {
    const { name, phone, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, phone, password: hashedPassword });

    try {
        await user.save();
        res.json({ success: true, redirectUrl: "application.html" });
    } catch (error) {
        res.status(500).json({ error: "Registration failed" });
    }
});

// **Login User**
app.post("/login", async (req, res) => {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });

    if (user && (await bcrypt.compare(password, user.password))) {
        const token = jwt.sign({ phone: user.phone }, process.env.JWT_SECRET, { expiresIn: "1d" });
        res.json({ success: true, redirectUrl: "application.html", token });
    } else {
        res.status(400).json({ error: "Invalid credentials" });
    }
});

// **Submit Application**
app.post("/submit-application", async (req, res) => {
    const application = new Application(req.body);
    
    try {
        await application.save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Application failed" });
    }
});

// **STK Push Payment**
app.post("/stk-push", async (req, res) => {
    const { phone, amount } = req.body;
    
    // Replace with your M-Pesa API credentials
    const consumerKey = LeE1pGhLGGJOYtVlB5RgOJFErodkpQvTTnJJ3QuQ4uD2SskG;
    const consumerSecret = XAAAEtGP54zsyfGdmxAopDbp2DU4VcvrgvVbnDq9vlAKxOIwYLXj0lGeGOEGrQbh;
    const shortCode = 8138042;
    const passkey = process.env.MPESA_PASSKEY;

    const timestamp = new Date().toISOString().replace(/[-T:]/g, "").slice(0, 14);
    const password = Buffer.from(`${shortCode}${passkey}${timestamp}`).toString("base64");

    try {
        // Get access token
        const tokenResponse = await axios.get("https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
            auth: { username: consumerKey, password: consumerSecret }
        });

        const token = tokenResponse.data.access_token;

        // Send STK Push request
        const response = await axios.post("https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
            BusinessShortCode: shortCode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: amount,
            PartyA: phone,
            PartyB: shortCode,
            PhoneNumber: phone,
            CallBackURL: "https://yourdomain.com/callback",
            AccountReference: "Give Direct",
            TransactionDesc: "Give Direct Donation"
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });

        res.json({ success: true, message: "STK Push sent" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Payment request failed" });
    }
});

// **Start Server**
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

