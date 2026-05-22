const express = require("express");

const router = express.Router();

const {
    verifyEmployee
} = require("../../Controllers/Auth/EmployeeAuthController");

router.post(
    "/verify-employee",
    verifyEmployee
);

module.exports = router;