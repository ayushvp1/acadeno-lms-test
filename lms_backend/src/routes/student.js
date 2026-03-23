const express = require('express');
const router  = express.Router();
const studentController = require('../controllers/studentController');
const authenticate = require('../middleware/authenticate');

// GET /student/dashboard -- Get the dashboard info for the current student
router.get('/dashboard', authenticate, studentController.getStudentDashboard);

module.exports = router;
