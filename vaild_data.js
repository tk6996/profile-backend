module.exports = {
  checkEducation: (education) => {
    if (Array.isArray(education)) {
      for (const edu of education) {
        if (isNaN(edu.year) || !edu.name) return false;
      }
      return true;
    } else return false;
  },
  checkPosition: (position) => {
    if (Array.isArray(position)) {
      for (const pos of position) {
        if (isNaN(pos.year) || !pos.description) return false;
      }
      return true;
    } else return false;
  },
};
