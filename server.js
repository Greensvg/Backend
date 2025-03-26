require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log("MongoDB connected successfully"))
.catch(err => console.error("MongoDB connection error:", err));

// User Schema
const UserSchema = new mongoose.Schema({
    name: String,
    phone: String,
    password: String,
});
const User = mongoose.model("User", UserSchema);

// Registration Route
app.post("/register", async (req, res) => {
    try {
        const { name, phone, password } = req.body;
        if (!name || !phone || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ name, phone, password: hashedPassword });

        await user.save();
        res.json({ success: true, redirectUrl: "application.html" });
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ error: "Registration failed. Try again later." });
    }
});

// Login Route
app.post("/login", async (req, res) => {
    try {
        const { phone, password } = req.body;
        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(400).json({ error: "User not found" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ error: "Invalid password" });
        }

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
            expiresIn: "1h",
        });

        res.json({ success: true, token, redirectUrl: "dashboard.html" });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: "Login failed. Try again later." });
    }
});

// M-Pesa STK Push Route
app.post("/stk-push", async (req, res) => {
    try {
        const { phone, amount } = req.body;

        const consumerKey = process.env.MPESA_CONSUMER_KEY;
        const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
        const callbackUrl = process.env.MPESA_CALLBACK_URL;
        const shortcode = process.env.MPESA_SHORTCODE;
        const passkey = process.env.MPESA_PASSKEY;

        const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, "").substring(0, 14);
        const password = Buffer.from(shortcode + passkey + timestamp).toString("base64");

        // Generate M-Pesa Access Token
        const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
        const { data: tokenResponse } = await axios.get(
            "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
            { headers: { Authorization: `Basic ${auth}` } }
        );
        const accessToken = tokenResponse.access_token;

        // Initiate STK Push
        const { data: stkResponse } = await axios.post(
            "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
            {
                BusinessShortCode: shortcode,
                Password: password,
                Timestamp: timestamp,
                TransactionType: "CustomerPayBillOnline",
                Amount: amount,
                PartyA: phone,
                PartyB: shortcode,
                PhoneNumber: phone,
                CallBackURL: callbackUrl,
                AccountReference: "PESA PAY",
                TransactionDesc: "Deposit",
            },
            { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
        );

        res.json({ success: true, response: stkResponse });
    } catch (error) {
        console.error("STK Push error:", error);
        res.status(500).json({ error: "STK Push failed. Try again later." });
    }
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: "Something went wrong!" });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
