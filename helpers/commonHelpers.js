module.exports = {
    escapeRegex: (text) => {
        return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    }
};
