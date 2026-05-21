const express = require("express");

const router = express.Router();

const {
    verifyEmployee
} = require("../../controllers/auth/employeeVerificationController");

router.post(
    "/verify-employee",
    verifyEmployee
);

module.exports = router;