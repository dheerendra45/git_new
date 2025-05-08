// Global error handling middleware
const errorHandler = (err, req, res, next) => {
	console.error("Error:", err);

	// Determine status code - default to 500 if none provided
	const statusCode = err.statusCode || 500;

	// Return error response
	res.status(statusCode).json({
		success: false,
		message: err.message || 'Internal Server Error',
		error: process.env.NODE_ENV === 'production' ? {} : err.stack
	});
};

module.exports = errorHandler;